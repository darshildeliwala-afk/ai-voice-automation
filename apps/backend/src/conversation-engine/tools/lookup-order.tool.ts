import { Injectable, NotFoundException } from "@nestjs/common";

import { CustomerService } from "../../customer/customer.service";
import { OrderService } from "../../order/order.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Looks up an order. Resolution order (unchanged priority from Sprint 15,
 * plus one new fallback):
 *   1. Explicit orderId arg -- validated against BOTH the caller's
 *      workspace and the current customer (OrderService.getOrderById()
 *      is not workspace-scoped on its own -- mirrors the same defensive
 *      check PromptBuilderService/TelephonyService use for the same gap)
 *      so a model-supplied id can never leak another customer's order.
 *   2. phone arg (Sprint 19) -- resolves a *different* customer within
 *      the workspace via CustomerService.findByIdentifier, then their
 *      most recent order. Deliberately not restricted to the current
 *      conversation's customer -- this is the "look up a different
 *      customer's order by phone" capability.
 *   3. context.orderId -- the order this conversation is already about.
 */
@Injectable()
export class LookupOrderTool implements IAITool {
  constructor(
    private readonly orderService: OrderService,
    private readonly customerService: CustomerService,
  ) {}

  name(): string {
    return "lookup_order";
  }

  description(): string {
    return "Retrieves order details (status, payment type, total, items, courier, tracking, ETA). Omit orderId/phone to use the order this conversation is about; provide phone to look up a different customer's most recent order.";
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
        phone: {
          type: "string",
          description:
            "Phone number of a different customer whose most recent order should be looked up.",
        },
      },
      required: [],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const explicitOrderId =
      typeof args.orderId === "string" ? args.orderId : undefined;
    const phone = typeof args.phone === "string" ? args.phone : undefined;

    if (explicitOrderId) {
      const order = await this.orderService.getOrderById(explicitOrderId);

      if (
        order.workspaceId !== context.workspaceId ||
        order.customerId !== context.customerId
      ) {
        throw new NotFoundException(`Order ${explicitOrderId} not found`);
      }

      return { content: JSON.stringify(this.formatOrder(order)) };
    }

    if (phone) {
      const customer = await this.customerService.findByIdentifier(
        context.workspaceId,
        { phone },
      );
      const order = customer
        ? await this.orderService.getMostRecentOrderForCustomer(
            context.workspaceId,
            customer.id,
          )
        : null;

      if (!order) {
        return {
          content: JSON.stringify({
            error: `No order found for a customer with phone ${phone}.`,
          }),
        };
      }

      return { content: JSON.stringify(this.formatOrder(order)) };
    }

    if (!context.orderId) {
      return {
        content: JSON.stringify({
          error: "No order is associated with this conversation.",
        }),
      };
    }

    const order = await this.orderService.getOrderById(context.orderId);

    return { content: JSON.stringify(this.formatOrder(order)) };
  }

  private formatOrder(order: {
    id: string;
    marketplace: string;
    status: string;
    paymentType: string;
    totalAmount: unknown;
    currency: string;
    courier: string | null;
    trackingId: string | null;
    estimatedDeliveryAt: Date | null;
    items: { name: string; quantity: number; unitPrice: unknown }[];
  }) {
    return {
      id: order.id,
      marketplace: order.marketplace,
      // "Shipping status" is deliberately just `status` (already covers
      // SHIPPED/DELIVERED) -- no duplicate field.
      status: order.status,
      paymentType: order.paymentType,
      totalAmount: order.totalAmount,
      currency: order.currency,
      courier: order.courier,
      trackingId: order.trackingId,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };
  }
}
