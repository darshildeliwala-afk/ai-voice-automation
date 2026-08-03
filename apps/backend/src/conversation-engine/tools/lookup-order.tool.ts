import { Injectable, NotFoundException } from "@nestjs/common";

import { OrderService } from "../../order/order.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Looks up an order. Defaults to the order bound to the current
 * conversation; if the model supplies an explicit orderId, it is
 * validated against BOTH the caller's workspace and the current customer
 * (OrderService.getOrderById() is not workspace-scoped on its own -- this
 * mirrors the same defensive check PromptBuilderService/TelephonyService
 * already use for the same gap) so a model-supplied id can never leak
 * another customer's order.
 */
@Injectable()
export class LookupOrderTool implements IAITool {
  constructor(private readonly orderService: OrderService) {}

  name(): string {
    return "lookup_order";
  }

  description(): string {
    return "Retrieves order details (status, payment type, total, items). Omit orderId to use the order this conversation is about.";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description:
            "UUID of the order to look up. Omit to use the current conversation's order.",
        },
      },
      required: [],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const orderId = (args.orderId as string | undefined) ?? context.orderId;

    if (!orderId) {
      return {
        content: JSON.stringify({
          error: "No order is associated with this conversation.",
        }),
      };
    }

    const order = await this.orderService.getOrderById(orderId);

    if (
      order.workspaceId !== context.workspaceId ||
      order.customerId !== context.customerId
    ) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return {
      content: JSON.stringify({
        id: order.id,
        marketplace: order.marketplace,
        status: order.status,
        paymentType: order.paymentType,
        totalAmount: order.totalAmount,
        currency: order.currency,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }),
    };
  }
}
