import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { ConversationStatus } from "../../generated/prisma/client";
import { CallSummaryService } from "../call-summary.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Marks the conversation as concluded (real live-call hangup is handled
 * by the Sprint 18 MediaSession orchestrator reacting to this status
 * change) and triggers automatic call-summary generation (Sprint 19).
 * Summary generation is awaited but never fatal -- a failure there must
 * never block call termination, so it's wrapped in try/catch and only
 * logged (same pattern as TelephonyWebhookService.triggerConversationEngine).
 */
@Injectable()
export class EndCallTool implements IAITool {
  private readonly logger = new Logger(EndCallTool.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly callSummaryService: CallSummaryService,
  ) {}

  name(): string {
    return "end_call";
  }

  description(): string {
    return "Ends the conversation, e.g. once the customer's request has been fully resolved.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the call is ending, e.g. 'issue resolved'.",
        },
      },
      required: [],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const reason =
      typeof args.reason === "string" ? args.reason : "Conversation ended.";

    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: { status: ConversationStatus.COMPLETED },
    });

    try {
      await this.callSummaryService.generateAndPersist(
        context.conversationId,
        context.workspaceId,
      );
    } catch (error) {
      this.logger.error(
        `Call summary generation failed for conversation ${context.conversationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      content: JSON.stringify({ ended: true, reason }),
      terminal: true,
    };
  }
}
