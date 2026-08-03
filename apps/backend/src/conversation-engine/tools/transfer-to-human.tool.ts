import { Injectable, Logger } from "@nestjs/common";

import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Records a request to transfer the conversation to a human agent. No
 * real telephony transfer capability exists yet (that requires a live
 * call bridge -- Sprint 16); this tool's job in this sprint is limited to
 * recording the intent (persisted via the tool-result ConversationMessage
 * the framework already writes) so a future transfer mechanism has a
 * clear signal to act on. Terminal: true, since the AI hands off rather
 * than continuing the conversation itself.
 */
@Injectable()
export class TransferToHumanTool implements IAITool {
  private readonly logger = new Logger(TransferToHumanTool.name);

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

  execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const reason =
      typeof args.reason === "string" ? args.reason : "Not specified";

    this.logger.log(
      `Transfer to human requested for conversation ${context.conversationId}: ${reason}`,
    );

    return Promise.resolve({
      content: JSON.stringify({
        transferRequested: true,
        reason,
        note: "No live transfer capability exists yet -- this request has been recorded.",
      }),
      terminal: true,
    });
  }
}
