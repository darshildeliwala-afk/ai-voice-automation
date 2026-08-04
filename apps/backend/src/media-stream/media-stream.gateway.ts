import { Inject, Injectable, Logger } from "@nestjs/common";
import type WebSocket from "ws";

import { STTProviderFactory } from "../ai/providers/stt-provider.factory";
import { TTSProviderFactory } from "../ai/providers/tts-provider.factory";
import { CallQueueService } from "../call-queue/call-queue.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversationEngineService } from "../conversation-engine/conversation-engine.service";
import { VoicePersonaConfigService } from "../workspace-settings/voice-persona-config.service";
import { MEDIA_SESSION_CONFIG, type MediaSessionConfig } from "./media-session.config";
import { MediaSession } from "./media-session";

/**
 * Stateless connection entry point for the Sprint 18 real-time Session
 * Orchestrator -- validates the callId every Plivo Media Stream
 * connection carries (see TelephonyWebhookService.buildMediaStreamUrl)
 * and creates one MediaSession per connection, wiring its raw `ws`
 * lifecycle events straight to that session. Holds no per-call state
 * itself; MediaStreamBootstrap (media-stream.bootstrap.ts) is what
 * actually accepts the WS upgrade and calls handleConnection().
 */
@Injectable()
export class MediaStreamGateway {
  private readonly logger = new Logger(MediaStreamGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sttProviderFactory: STTProviderFactory,
    private readonly ttsProviderFactory: TTSProviderFactory,
    private readonly conversationEngine: ConversationEngineService,
    private readonly callQueueService: CallQueueService,
    private readonly voicePersonaConfigService: VoicePersonaConfigService,
    @Inject(MEDIA_SESSION_CONFIG)
    private readonly mediaSessionConfig: MediaSessionConfig,
  ) {}

  handleConnection(ws: WebSocket, callId: string | null): void {
    if (!callId) {
      this.logger.warn("Rejecting media-stream connection with no callId");
      ws.close(1008, "callId required");
      return;
    }

    const session = new MediaSession(ws, callId, {
      prisma: this.prisma,
      sttProviderFactory: this.sttProviderFactory,
      ttsProviderFactory: this.ttsProviderFactory,
      conversationEngine: this.conversationEngine,
      callQueueService: this.callQueueService,
      voicePersonaConfigService: this.voicePersonaConfigService,
      mediaSessionConfig: this.mediaSessionConfig,
    });

    ws.on("message", (data: WebSocket.RawData) => session.handleMessage(data as Buffer));
    ws.on("close", () => session.handleClose());
    ws.on("error", (error: Error) => session.handleError(error));
  }
}
