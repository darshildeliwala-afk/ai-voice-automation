import { Injectable } from "@nestjs/common";

import { CustomerTagService } from "../../customer/customer-tag.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Lets the AI add/remove tags on the current customer (Sprint 19), e.g.
 * "Hot Lead", "VIP", "Needs Callback". Add/remove deltas only -- never a
 * full replacement array -- so a manually-added tag survives untouched
 * unless this call's `remove` list explicitly names it. Always resolves
 * context.customerId/workspaceId (never model-supplied), same security
 * posture as lookup_customer's default path. Normalization/dedup/usage
 * stats are handled by CustomerTagService.
 */
@Injectable()
export class UpdateCustomerTagsTool implements IAITool {
  constructor(private readonly customerTagService: CustomerTagService) {}

  name(): string {
    return "update_customer_tags";
  }

  description(): string {
    return "Adds and/or removes tags on the current customer, e.g. 'Hot Lead', 'VIP', 'Needs Callback', 'Cold Lead', 'Complaint', 'Repeat Customer'. Provide add/remove as arrays of tag names.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        add: {
          type: "array",
          items: { type: "string" },
          description: "Tags to add, e.g. ['Hot Lead'].",
        },
        remove: {
          type: "array",
          items: { type: "string" },
          description: "Tags to remove, e.g. ['Cold Lead'].",
        },
      },
      required: [],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const add = asStringArray(args.add);
    const remove = asStringArray(args.remove);

    const tags = await this.customerTagService.updateTags(
      context.workspaceId,
      context.customerId,
      { add, remove },
    );

    return { content: JSON.stringify({ tags }) };
  }
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}
