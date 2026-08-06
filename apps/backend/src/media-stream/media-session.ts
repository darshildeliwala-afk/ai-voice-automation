import { Logger } from "@nestjs/common";
import type WebSocket from "ws";

import type { ISTTStream } from "../ai/interfaces/stt-provider.interface";
import type { ITTSProvider, ITTSStream } from "../ai/interfaces/tts-provider.interface";
import type { STTProviderFactory } from "../ai/providers/stt-provider.factory";
import type { TTSProviderFactory } from "../ai/providers/tts-provider.factory";
import type { CallQueueService } from "../call-queue/call-queue.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { ConversationEngineService } from "../conversation-engine/conversation-engine.service";
import { LiveCallAiStatus, LiveCallSpeakingParty } from "../generated/prisma/client";
import type { TelephonyProviderFactory } from "../telephony/providers/telephony-provider.factory";
import type {
  EffectiveVoicePersona,
  VoicePersonaConfigService,
} from "../workspace-settings/voice-persona-config.service";
import type { MediaSessionConfig } from "./media-session.config";
import {
  buildClearAudioMessage,
  buildPlayAudioMessage,
  decodeMediaPayload,
  parseInboundMessage,
  type PlivoMediaEvent,
} from "./plivo-media-protocol";
import { SilenceDetector } from "./silence-detector";

export interface MediaSessionDeps {
  prisma: PrismaService;
  sttProviderFactory: STTProviderFactory;
  ttsProviderFactory: TTSProviderFactory;
  conversationEngine: ConversationEngineService;
  callQueueService: CallQueueService;
  voicePersonaConfigService: VoicePersonaConfigService;
  mediaSessionConfig: MediaSessionConfig;
  telephonyProviderFactory: TelephonyProviderFactory;
}

const AUDIO_CONTENT_TYPE = "audio/x-mulaw";
const AUDIO_SAMPLE_RATE = 8000;
const AUDIO_ENCODING = "mulaw";
/** Spoken (best-effort) before hanging up on an unrecoverable session error (Sprint 21) -- better than leaving the customer connected to silence indefinitely. */
const FAILURE_APOLOGY_MESSAGE =
  "I'm sorry, we're having a technical issue on our end. Please try calling again shortly.";
/** Spoken when a single turn is aborted by MediaSessionConfig.aiResponseTimeoutMs (Sprint 21) -- a stuck LLM/provider call must never leave the customer in total silence. */
const TURN_TIMEOUT_MESSAGE = "Sorry, that's taking longer than expected. Let me try again.";
/** WebSocket.OPEN's value per the ws/browser spec (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED) -- hardcoded since `ws` is only imported as a type here. */
const WS_READY_STATE_OPEN = 1;

/**
 * One instance per live call -- not Nest-injectable, same reasoning as
 * ElevenLabsStream/Deepgram's stream class being plain classes. This is
 * the Sprint 18 real-time Session Orchestrator: ties Plivo's raw audio WS
 * to STT -> ConversationEngine (which itself resolves the Workflow/LLM
 * turn) -> TTS -> back to Plivo, resolving one EffectiveVoicePersona once
 * at call start and reusing it for every turn in the call (never
 * re-resolved per turn -- see onStart()).
 *
 * Isolated future optimization points (Sprint 18 scope cuts, not faked
 * here): speak() synthesizes a turn's full reply in one call rather than
 * chunking it by persona.pauseShortMs/pauseMediumMs/pauseLongMs, and
 * handleUserTurn() waits for the full ConversationEngine turn rather than
 * streaming LLM tokens into TTS as they arrive (IAIProvider.chat() isn't
 * streaming yet). Both cuts are marked at their call sites below.
 */
export class MediaSession {
  private readonly logger = new Logger(MediaSession.name);

  private workspaceId: string | null = null;
  private customerId: string | null = null;
  private orderId: string | undefined;
  /** Cached for a best-effort REST hangup on an unrecoverable failure (Sprint 21) -- set as early as possible in onStart() so it's available even if a later setup step throws. */
  private providerCallId: string | null = null;
  private aiAgentId: string | undefined;
  private conversationId: string | null = null;
  private persona: EffectiveVoicePersona | null = null;

  private ttsProvider: ITTSProvider | null = null;
  private sttStream: ISTTStream | null = null;
  private currentTtsStream: ITTSStream | null = null;
  private currentTurnAbort: AbortController | null = null;
  private silenceDetector: SilenceDetector | null = null;
  private pendingTranscript = "";
  /** Sprint 21 latency logging -- timestamp of the current utterance's first STT event, null between utterances. */
  private utteranceSttStartedAt: number | null = null;
  /** Set the moment handleClose() runs; onStart() checks this after its network-bound awaits so a call that hangs up mid-startup can't leak a live STT connection nobody will ever close. */
  private closed = false;

  constructor(
    private readonly ws: WebSocket,
    private readonly callId: string,
    private readonly deps: MediaSessionDeps,
  ) {}

  handleMessage(raw: string | Buffer): void {
    const event = parseInboundMessage(raw);
    if (!event) {
      return;
    }

    switch (event.event) {
      case "start":
        void this.onStart();
        break;
      case "media":
        // Emotion-detection/adaptive-speech-rate future features (Sprint
        // 18 amendment #4) plug in here -- before/after decodeMediaPayload,
        // without touching the surrounding dispatch or barge-in logic.
        this.onMedia(event as PlivoMediaEvent);
        break;
      case "stop":
        this.handleClose();
        break;
      default:
        break;
    }
  }

  handleClose(): void {
    this.closed = true;
    this.sttStream?.close();
    this.sttStream = null;
    this.currentTtsStream?.cancel();
    this.currentTtsStream = null;
    this.silenceDetector?.stop();
    this.currentTurnAbort?.abort();
    this.currentTurnAbort = null;
    // deleteMany, not delete -- the row may not exist if onStart() never
    // got far enough to seed it, which would make delete() throw P2025.
    // A call no longer live shouldn't appear in "list active calls"
    // (Sprint 20 admin Live Call API).
    void this.deps.prisma.liveCallState
      .deleteMany({ where: { callId: this.callId } })
      .catch((error) => this.logLiveStateWriteFailure(error));
  }

  /**
   * Sprint 21 production-validation fix: previously this only logged and
   * tore down local state, leaving the customer connected with silence
   * forever on any unrecoverable failure (missing AI/STT/TTS config, an
   * unimplemented provider, a mid-call STT disconnect). Now it also
   * best-effort speaks a short apology (if TTS is available) and asks the
   * telephony provider to hang up the underlying call. Neither is
   * guaranteed to complete before the other (no server-side TTS-completion
   * signal from the provider), but doing both is strictly better than the
   * previous silent-forever behavior.
   */
  handleError(error: Error): void {
    this.logger.error(
      `Media session error for call ${this.callId}`,
      error.stack,
    );
    this.handleClose();

    if (this.ttsProvider && this.persona && this.ws.readyState === WS_READY_STATE_OPEN) {
      this.speak(FAILURE_APOLOGY_MESSAGE);
    }
    void this.hangupProviderCall();
  }

  private async hangupProviderCall(): Promise<void> {
    if (!this.workspaceId || !this.providerCallId) {
      return;
    }
    try {
      const provider = await this.deps.telephonyProviderFactory.createForWorkspace(
        this.workspaceId,
      );
      await provider.hangup(this.providerCallId);
    } catch (hangupError) {
      this.logger.warn(
        `Failed to hang up call ${this.callId} after an unrecoverable error: ${
          hangupError instanceof Error ? hangupError.message : String(hangupError)
        }`,
      );
    }
  }

  private async onStart(): Promise<void> {
    try {
      const call = await this.deps.prisma.call.findFirst({
        where: { id: this.callId },
      });
      if (!call) {
        this.logger.error(`Media stream start event for unknown call ${this.callId}`);
        this.ws.close();
        return;
      }
      this.workspaceId = call.workspaceId;
      this.customerId = call.customerId;
      this.orderId = call.orderId;
      this.providerCallId = call.providerCallId;

      const queueItem = await this.deps.callQueueService.findById(call.callQueueId);
      this.aiAgentId = queueItem.aiAgentId ?? undefined;

      // Resolved exactly once for the whole call and cached on this
      // instance -- every subsequent turn in this call reuses it rather
      // than re-querying VoicePersonaConfigService (Sprint 18 requirement:
      // "resolve the effective persona once at call start and reuse it
      // throughout the conversation").
      this.persona = await this.deps.voicePersonaConfigService.resolveEffectiveConfig(
        this.workspaceId,
        this.aiAgentId,
      );

      this.ttsProvider = await this.deps.ttsProviderFactory.createForWorkspace(
        this.workspaceId,
      );

      const sttProvider = await this.deps.sttProviderFactory.createForWorkspace(
        this.workspaceId,
      );
      this.sttStream = sttProvider.startStream({
        sampleRate: AUDIO_SAMPLE_RATE,
        encoding: AUDIO_ENCODING,
        language: this.persona.language,
      });

      // The WS may have closed (customer hung up instantly) while the
      // awaits above were in flight -- handleClose() already ran and
      // won't run again, so without this check the STT stream just
      // opened above would stay connected to Deepgram forever.
      if (this.closed) {
        this.sttStream.close();
        this.sttStream = null;
        return;
      }

      this.sttStream.onTranscript((result) => {
        this.silenceDetector?.recordActivity();

        // Sprint 21 production validation -- best-effort STT latency:
        // time from this utterance's first STT event (interim or final)
        // to its finalized transcript. Not a pure provider-engine number
        // (it includes however long the customer kept talking), but it's
        // the closest proxy available without provider-level timestamps.
        if (this.utteranceSttStartedAt === null) {
          this.utteranceSttStartedAt = Date.now();
        }

        // Barge-in is keyed off the STT provider's own detection of
        // speech (any transcript event, interim or final), never off raw
        // inbound audio frames -- Plivo streams continuous bidirectional
        // audio (silence included) for the whole call, so gating on
        // "a media frame arrived" would cancel the AI's own speech within
        // milliseconds of it starting, every single time.
        if ((this.currentTtsStream || this.currentTurnAbort) && this.persona?.bargeInEnabled) {
          this.bargeIn();
        }

        if (result.isFinal) {
          if (this.utteranceSttStartedAt !== null) {
            this.logger.log(
              `STT latency for call ${this.callId}: ${Date.now() - this.utteranceSttStartedAt}ms`,
            );
            this.utteranceSttStartedAt = null;
          }
          this.pendingTranscript = "";
          void this.handleUserTurn(result.text);
        } else {
          this.pendingTranscript = result.text;
        }
      });
      this.sttStream.onError((error) => this.handleError(error));

      // Fallback backstop complementing the STT provider's own endpointing
      // (isFinal), not a replacement for it -- see SilenceDetector's own
      // doc comment. Persona's silenceThresholdMs overrides the global
      // MediaSessionConfig default per workspace/agent.
      this.silenceDetector = new SilenceDetector(
        this.persona.silenceThresholdMs || this.deps.mediaSessionConfig.silenceTimeoutMs,
        () => {
          if (this.pendingTranscript) {
            const text = this.pendingTranscript;
            this.pendingTranscript = "";
            void this.handleUserTurn(text);
          }
        },
      );

      // TelephonyWebhookService.processWebhook always creates this
      // Conversation (and its first ASSISTANT greeting message) before
      // ever returning the answer XML that embeds this WS's own URL -- so
      // it is guaranteed to already exist by the time Plivo opens this
      // connection and sends `start`.
      const conversation = await this.deps.prisma.conversation.findUnique({
        where: { callId: this.callId },
      });
      if (!conversation) {
        // Unrecoverable: STT is already connected and hooked up at this
        // point, so routing through handleError() (not a bare return)
        // closes it instead of leaking it, and attempts a spoken apology
        // + provider hangup instead of leaving the customer on dead air.
        this.handleError(
          new Error(`No Conversation found for call ${this.callId} on media-stream start`),
        );
        return;
      }
      this.conversationId = conversation.id;
      this.updateLiveCallState({
        speakingParty: LiveCallSpeakingParty.SILENCE,
        aiStatus: LiveCallAiStatus.LISTENING,
      });

      const greeting = await this.deps.prisma.conversationMessage.findFirst({
        where: { conversationId: conversation.id, role: "ASSISTANT" },
        orderBy: { createdAt: "desc" },
      });
      if (greeting && !this.closed) {
        this.speak(greeting.content);
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private onMedia(event: PlivoMediaEvent): void {
    // Just forwards raw audio to STT -- barge-in decisions live in the
    // onTranscript handler (see onStart()), keyed off detected speech
    // rather than off audio frames arriving.
    const chunk = decodeMediaPayload(event);
    this.sttStream?.sendAudio(chunk);
  }

  /**
   * Isolated future optimization point: this waits for the full
   * ConversationEngine turn (one complete IAIProvider.chat() response)
   * before synthesizing anything. Streaming partial LLM tokens into TTS
   * as they arrive would need IAIProvider.chat() itself to become
   * streaming -- out of scope for Sprint 18 (see plan section 1).
   */
  private async handleUserTurn(text: string): Promise<void> {
    if (!text.trim() || !this.conversationId || !this.workspaceId || !this.customerId) {
      return;
    }

    // Sprint 21 production validation -- "round-trip latency": from the
    // finalized customer utterance to the reply being ready to speak
    // (covers workflow + tool-calling + LLM time; TTS's own time-to-
    // first-audio is logged separately inside speak()).
    const turnStartedAt = Date.now();

    // A new utterance finalizing while a previous turn is still being
    // processed is itself a barge-in on the AI's "thinking" -- cancel it
    // rather than run two concurrent processMessage() calls for the same
    // conversation (which would race on which reply gets spoken).
    this.currentTurnAbort?.abort();

    // Captured locally rather than read back off `this` in `finally`:
    // if a *third* utterance starts its own turn before this one settles,
    // `this.currentTurnAbort` will already point at that newer turn's
    // controller by the time this one's `finally` runs, and clearing the
    // field unconditionally would wipe out the newer turn's controller.
    const abortController = new AbortController();
    this.currentTurnAbort = abortController;
    this.updateLiveCallState({
      aiStatus: LiveCallAiStatus.THINKING,
      speakingParty: LiveCallSpeakingParty.SILENCE,
      lastTranscriptSnippet: text,
    });

    // Sprint 21: bounds how long a single turn can wait on the LLM/tool
    // pipeline. Without this, a stalled provider call (no SDK-level
    // timeout is configured) could leave the customer "thinking" in
    // silence indefinitely -- reuses the same abortSignal barge-in
    // already threads through to provider.chat(), so a timeout aborts
    // the in-flight call exactly like a customer interruption would.
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, this.deps.mediaSessionConfig.aiResponseTimeoutMs);

    try {
      const result = await this.deps.conversationEngine.processMessage({
        workspaceId: this.workspaceId,
        customerId: this.customerId,
        orderId: this.orderId,
        aiAgentId: this.aiAgentId,
        conversationId: this.conversationId,
        callId: this.callId,
        message: text,
        abortSignal: abortController.signal,
      });
      if (result.lastNodeKey) {
        this.updateLiveCallState({ currentWorkflowNodeKey: result.lastNodeKey });
      }
      this.logger.log(
        `Round-trip latency for call ${this.callId}: ${Date.now() - turnStartedAt}ms (utterance to reply-ready)`,
      );
      // Only speak this result if it's still the current turn -- a newer
      // utterance may have superseded (and aborted) this one while
      // processMessage() was in flight; if the abort signal didn't stop
      // it in time, don't let a stale reply get spoken over the new one.
      if (!this.closed && this.currentTurnAbort === abortController) {
        this.speak(result.content);
      }
    } catch (error) {
      if (timedOut) {
        this.logger.warn(
          `Turn timed out after ${this.deps.mediaSessionConfig.aiResponseTimeoutMs}ms for call ${this.callId}`,
        );
        if (!this.closed && this.currentTurnAbort === abortController) {
          this.speak(TURN_TIMEOUT_MESSAGE);
        }
      } else if (!abortController.signal.aborted) {
        this.logger.error(
          `Conversation engine failed to process a turn for call ${this.callId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    } finally {
      clearTimeout(timeoutHandle);
      if (this.currentTurnAbort === abortController) {
        this.currentTurnAbort = null;
      }
    }
  }

  /**
   * Isolated future optimization point: synthesizes `text` in one
   * synthesizeStream() call. Chunking it by clause and inserting
   * this.persona.pauseShortMs/pauseMediumMs/pauseLongMs between separate
   * calls -- for more natural pacing -- is deferred (see plan section 1);
   * the pause-duration config itself is real and resolved, just not
   * consumed yet.
   */
  private speak(text: string): void {
    if (!this.ttsProvider || !this.persona || !text) {
      return;
    }

    this.updateLiveCallState({
      aiStatus: LiveCallAiStatus.SPEAKING,
      speakingParty: LiveCallSpeakingParty.AI,
      turnStartedAt: new Date(),
    });

    const synthesisStartedAt = Date.now();
    let firstChunkLogged = false;

    const stream = this.ttsProvider.synthesizeStream(text, {
      sampleRate: AUDIO_SAMPLE_RATE,
      encoding: AUDIO_ENCODING,
      voice: this.persona.voiceName ?? undefined,
      speakingRate: this.persona.speakingRate,
      warmth: this.persona.warmth,
    });

    this.currentTtsStream = stream;
    stream.onAudioChunk((chunk) => {
      if (!firstChunkLogged) {
        // Sprint 21 production validation -- "TTS latency": time from
        // synthesis request to the first audio chunk being ready.
        firstChunkLogged = true;
        this.logger.log(
          `TTS latency for call ${this.callId}: ${Date.now() - synthesisStartedAt}ms (time to first audio chunk)`,
        );
      }
      if (this.ws.readyState !== WS_READY_STATE_OPEN) {
        return;
      }
      this.ws.send(
        buildPlayAudioMessage(chunk, {
          contentType: AUDIO_CONTENT_TYPE,
          sampleRate: AUDIO_SAMPLE_RATE,
        }),
      );
    });
    stream.onEnd(() => {
      if (this.currentTtsStream === stream) {
        this.currentTtsStream = null;
      }
    });
    stream.onError((error) => {
      this.logger.error(`TTS synthesis failed for call ${this.callId}`, error.stack);
      if (this.currentTtsStream === stream) {
        this.currentTtsStream = null;
      }
    });
  }

  /** The interruption seam (Sprint 18 amendment #4): stops AI audio, tells Plivo to clear its playback buffer, and cancels the in-flight LLM call. */
  private bargeIn(): void {
    this.updateLiveCallState({
      speakingParty: LiveCallSpeakingParty.CUSTOMER,
      aiStatus: LiveCallAiStatus.LISTENING,
    });
    this.currentTtsStream?.cancel();
    this.currentTtsStream = null;
    if (this.ws.readyState === WS_READY_STATE_OPEN) {
      this.ws.send(buildClearAudioMessage());
    }
    this.currentTurnAbort?.abort();
  }

  /**
   * Sprint 20 admin Live Call API -- persists live in-call state
   * (currently-speaking party, what the AI is doing, the current
   * workflow node, a transcript snippet) so an admin dashboard can list
   * active calls with real state instead of nothing. Always fire-and-
   * forget: the audio hot path must never block on a DB write, and a
   * failed live-state write is never allowed to break the call itself.
   */
  private updateLiveCallState(patch: {
    speakingParty?: LiveCallSpeakingParty;
    aiStatus?: LiveCallAiStatus;
    currentWorkflowNodeKey?: string;
    lastTranscriptSnippet?: string;
    turnStartedAt?: Date;
  }): void {
    if (!this.workspaceId) {
      return;
    }

    void this.deps.prisma.liveCallState
      .upsert({
        where: { callId: this.callId },
        create: {
          callId: this.callId,
          workspaceId: this.workspaceId,
          conversationId: this.conversationId,
          ...patch,
        },
        update: { conversationId: this.conversationId, ...patch },
      })
      .catch((error) => this.logLiveStateWriteFailure(error));
  }

  private logLiveStateWriteFailure(error: unknown): void {
    this.logger.warn(
      `Failed to update live call state for call ${this.callId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
