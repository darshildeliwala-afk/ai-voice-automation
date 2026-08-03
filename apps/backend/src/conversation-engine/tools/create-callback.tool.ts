import { Injectable } from "@nestjs/common";

import { CallQueueService } from "../../call-queue/call-queue.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

@Injectable()
export class CreateCallbackTool implements IAITool {
  constructor(private readonly callQueueService: CallQueueService) {}

  name(): string {
    return "create_callback";
  }

  description(): string {
    return "Schedules a future callback to the customer, e.g. when they ask to be called back later.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        scheduledAt: {
          type: "string",
          description:
            "ISO-8601 date-time for the callback, e.g. '2026-08-04T15:00:00Z'. Must be in the future.",
        },
      },
      required: ["scheduledAt"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    if (!context.orderId) {
      return {
        content: JSON.stringify({
          error: "No order is associated with this conversation; cannot schedule a callback.",
        }),
      };
    }

    const raw = typeof args.scheduledAt === "string" ? args.scheduledAt : "";
    const scheduledAt = new Date(raw);

    if (Number.isNaN(scheduledAt.getTime())) {
      return {
        content: JSON.stringify({
          error: `"${raw}" is not a valid ISO-8601 date-time.`,
        }),
      };
    }

    if (scheduledAt.getTime() <= Date.now()) {
      return {
        content: JSON.stringify({
          error: "scheduledAt must be in the future.",
        }),
      };
    }

    const queueItem = await this.callQueueService.enqueue(
      context.orderId,
      scheduledAt,
    );

    return {
      content: JSON.stringify({
        scheduled: true,
        queueId: queueItem.id,
        scheduledAt: queueItem.scheduledAt,
      }),
    };
  }
}
