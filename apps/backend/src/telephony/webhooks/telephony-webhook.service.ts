import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  AnswerResponse,
  NormalizedCallEvent,
} from "@ai-voice-automation/telephony-core";

import { CallQueueService } from "../../call-queue/call-queue.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ConversationEngineService } from "../../conversation-engine/conversation-engine.service";
import {
  CallStatus,
  Prisma,
  type Call,
} from "../../generated/prisma/client";
import { TelephonyProviderFactory } from "../providers/telephony-provider.factory";

/**
 * Synthetic first turn sent to the conversation engine when a call
 * connects. There is no live audio bridge yet (voice streaming is Sprint
 * 16, so there is no real customer utterance to pass along) -- this
 * prompts the AI agent to open with its configured greeting/context.
 */
const CALL_CONNECTED_TRIGGER_MESSAGE =
  "(The customer has just answered the call. Greet them and begin the conversation.)";

export interface WebhookRequestContext {
  callId: string;
  type: "answer" | "hangup";
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

const TERMINAL_STATUSES: ReadonlySet<CallStatus> = new Set([
  CallStatus.COMPLETED,
  CallStatus.FAILED,
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.CANCELLED,
]);

@Injectable()
export class TelephonyWebhookService {
  private readonly logger = new Logger(TelephonyWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: TelephonyProviderFactory,
    private readonly callQueueService: CallQueueService,
    private readonly conversationEngine: ConversationEngineService,
  ) {}

  /**
   * Handles both the answer_url and hangup_url callbacks (differentiated
   * by the `type` query param, both routed through the same
   * POST /telephony/webhook endpoint). Returns provider-specific XML for
   * the answer callback, or `null` for a plain 200 ack on hangup/other
   * lifecycle events.
   */
  async processWebhook(
    context: WebhookRequestContext,
  ): Promise<AnswerResponse | null> {
    const call = await this.prisma.call.findFirst({
      where: { id: context.callId },
    });

    if (!call) {
      throw new NotFoundException(`Call ${context.callId} not found`);
    }

    const provider = await this.providerFactory.createForWorkspace(
      call.workspaceId,
    );

    provider.validateWebhook({
      url: context.url,
      headers: context.headers,
      body: context.body,
    });

    const event = provider.normalizeWebhookEvent(context.body);

    this.assertEventCorrelatesToCall(call, event);

    const wasNew = await this.recordEventOnceOrSkip(
      call.provider,
      event.providerCallId || event.providerRequestId || context.callId,
      event.eventKey,
      context.body,
    );

    if (!wasNew) {
      this.logger.log(
        `Ignoring duplicate ${call.provider} webhook event ${event.eventKey} for call ${call.id}`,
      );
      return context.type === "answer"
        ? provider.buildAnswerResponse()
        : null;
    }

    await this.applyEventToCall(call, event);

    if (context.type === "answer") {
      return provider.buildAnswerResponse();
    }

    return null;
  }

  /**
   * Plivo's V2 signature is computed over the base URL only (protocol +
   * host + path) -- the query string, where we embed `callId` for routing,
   * is NOT covered. A validly-signed request could in principle be
   * replayed with a tampered `callId`. Guard against that by requiring the
   * event's own CallUUID/RequestUUID to match what we already recorded for
   * this Call (set from the synchronous makeCall() response before any
   * webhook arrives) -- a mismatch means this event belongs to a different
   * call entirely.
   */
  private assertEventCorrelatesToCall(
    call: Call,
    event: NormalizedCallEvent,
  ): void {
    if (!call.providerCallId) {
      return;
    }

    const matches =
      event.providerCallId === call.providerCallId ||
      event.providerRequestId === call.providerCallId;

    if (!matches) {
      throw new BadRequestException(
        "Webhook event does not correlate to the expected provider call",
      );
    }
  }

  /**
   * Inserts a TelephonyWebhookEvent row guarded by a unique constraint on
   * (provider, providerCallId, eventType) -- the idempotency boundary.
   * Returns false (and does nothing else) when the event was already
   * recorded, so a redelivered webhook never double-applies.
   */
  private async recordEventOnceOrSkip(
    provider: Call["provider"],
    providerCallId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.prisma.telephonyWebhookEvent.create({
        data: {
          provider,
          providerCallId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }

  private async applyEventToCall(
    call: Call,
    event: {
      providerCallId: string;
      status: CallStatus;
      recordingUrl: string | null;
      durationSeconds: number | null;
      hangupReason: string | null;
    },
  ): Promise<void> {
    const isFirstConnect =
      event.status === CallStatus.CONNECTED && !call.answeredAt;
    const isTerminal = TERMINAL_STATUSES.has(event.status);

    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: event.status,
        providerCallId: event.providerCallId || call.providerCallId,
        answeredAt: isFirstConnect ? new Date() : call.answeredAt,
        endedAt: isTerminal ? new Date() : call.endedAt,
        durationSeconds: event.durationSeconds ?? call.durationSeconds,
        recordingUrl: event.recordingUrl ?? call.recordingUrl,
        hangupReason: event.hangupReason ?? call.hangupReason,
      },
    });

    if (isFirstConnect) {
      await this.triggerConversationEngine(call);
    }

    if (isTerminal) {
      await this.callQueueService.complete(call.callQueueId);
    }
  }

  /**
   * Worker Integration (Sprint 15): apps/worker itself has no DB access to
   * Conversation/AiAgent/AiProviderConfig (only a minimal mirrored schema
   * for placing the call -- see apps/worker/prisma/schema.prisma) and no
   * voice-streaming bridge exists yet to carry a real customer utterance
   * (Sprint 16). This call-answer event is the one real "the call is now
   * live" signal that already exists, and it runs in the same app/process
   * as the AI layer -- so it's where the conversation engine is invoked
   * instead of apps/worker calling it directly. Failures here are caught
   * and logged, never allowed to break call-lifecycle tracking (the
   * webhook's primary responsibility) or the response back to the provider.
   */
  private async triggerConversationEngine(call: Call): Promise<void> {
    try {
      const queueItem = await this.callQueueService.findById(
        call.callQueueId,
      );

      await this.conversationEngine.processMessage({
        workspaceId: call.workspaceId,
        customerId: call.customerId,
        orderId: call.orderId,
        aiAgentId: queueItem.aiAgentId ?? undefined,
        callId: call.id,
        message: CALL_CONNECTED_TRIGGER_MESSAGE,
      });
    } catch (error) {
      this.logger.error(
        `Conversation engine failed to process call-answer for call ${call.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
