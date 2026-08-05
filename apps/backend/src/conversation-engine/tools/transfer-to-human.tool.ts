import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { ConversationStatus } from "../../generated/prisma/client";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Requests a transfer to a human agent (Sprint 19): persists a
 * HumanTransferEvent record and flips the Conversation to
 * WAITING_FOR_HUMAN. No real telephony transfer capability exists yet
 * (that requires a live call bridge) -- this is purely the record +
 * status flip for a future admin/agent-facing flow to act on. Terminal:
 * true, since the AI hands off rather than continuing the conversation
 * itself.
 */
@Injectable()
export class TransferToHumanTool implements IAITool {
  private readonly logger = new Logger(TransferToHumanTool.name);

  constructor(private readonly prisma: PrismaService) {}

  name(): string {
    return "transfer_to_human";
  }

  description(): string {
    return "Requests a transfer to a human agent, e.g. when the customer explicitly asks for one or the request is beyond the AI's scope.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why a human is needed, e.g. 'customer requested a manager'.",
        },
      },
      required: ["reason"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const reason =
      typeof args.reason === "string" ? args.reason : "Not specified";

    this.logger.log(
      `Transfer to human requested for conversation ${context.conversationId}: ${reason}`,
    );

    await this.prisma.humanTransferEvent.create({
      data: {
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        reason,
      },
    });

    await this.prisma.conversation.update({
      where: { id: context.conversationId },
      data: { status: ConversationStatus.WAITING_FOR_HUMAN },
    });

    return {
      content: JSON.stringify({ transferRequested: true, reason }),
      terminal: true,
    };
  }
}
