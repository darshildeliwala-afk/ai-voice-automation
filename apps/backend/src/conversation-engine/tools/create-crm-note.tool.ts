import { Injectable } from "@nestjs/common";

import { CrmNoteService } from "../../crm-note/crm-note.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Lets the AI save a free-form CRM note about the current customer
 * (Sprint 19), scoped to the current customer/conversation via the
 * trusted AIToolExecutionContext -- never a model-supplied identifier.
 */
@Injectable()
export class CreateCrmNoteTool implements IAITool {
  constructor(private readonly crmNoteService: CrmNoteService) {}

  name(): string {
    return "create_crm_note";
  }

  description(): string {
    return "Saves a note about the current customer, e.g. a preference or something worth remembering for next time.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The note to record.",
        },
      },
      required: ["content"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const content = typeof args.content === "string" ? args.content : "";

    if (!content.trim()) {
      return { content: JSON.stringify({ error: "content is required." }) };
    }

    const note = await this.crmNoteService.createNote({
      workspaceId: context.workspaceId,
      customerId: context.customerId,
      conversationId: context.conversationId,
      content,
    });

    return {
      content: JSON.stringify({ noteCreated: true, noteId: note.id }),
    };
  }
}
