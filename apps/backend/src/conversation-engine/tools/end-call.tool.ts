import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { ConversationStatus } from "../../generated/prisma/client";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Marks the conversation as concluded. No live call to hang up exists yet
 * (voice streaming is Sprint 16) -- this records the AI's decision so a
 * future voice-streaming layer knows to end the call, and stops this
 * turn's tool-calling loop (terminal: true).
 */
@Injectable()
export class EndCallTool implements IAITool {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      content: JSON.stringify({ ended: true, reason }),
      terminal: true,
    };
  }
}
