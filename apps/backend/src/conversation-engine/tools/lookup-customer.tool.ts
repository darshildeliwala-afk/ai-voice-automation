import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CrmNoteService } from "../../crm-note/crm-note.service";
import { CustomerService } from "../../customer/customer.service";
import { OrderService } from "../../order/order.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

const RECENT_CONVERSATIONS_LIMIT = 5;

/**
 * Two modes, both workspace-scoped by construction (findByIdentifier()
 * always filters on context.workspaceId, so a model-supplied identifier
 * can only ever resolve to a customer inside the caller's own workspace
 * -- never a cross-tenant leak, regardless of which identifier is used):
 *
 * - No args (the original Sprint 15 behavior, unchanged): resolves
 *   context.customerId and returns the compact 4-field shape
 *   {name, phone, email, language}.
 * - phone/customerId/email given (Sprint 19): looks up that customer
 *   within the workspace and returns an enriched profile (tags,
 *   previous conversations, CRM notes, last order) -- or {found: false}
 *   if nothing matches. This is what lets the AI look up a different
 *   customer than the one currently on the call, e.g. "check my other
 *   number."
 */
@Injectable()
export class LookupCustomerTool implements IAITool {
  constructor(
    private readonly customerService: CustomerService,
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly crmNoteService: CrmNoteService,
  ) {}

  name(): string {
    return "lookup_customer";
  }

  description(): string {
    return "Retrieves a customer's profile. Omit all arguments to look up the current caller. Provide phone, customerId, or email to look up a different customer in the same workspace (e.g. the caller mentions a different number).";
  }

  parameters(): AIToolParameterSchema {
    return {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Phone number of the customer to look up.",
        },
        customerId: {
          type: "string",
          description: "UUID of the customer to look up.",
        },
        email: {
          type: "string",
          description: "Email address of the customer to look up.",
        },
      },
      required: [],
    };
  }

  async execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
    const phone = typeof args.phone === "string" ? args.phone : undefined;
    const customerId =
      typeof args.customerId === "string" ? args.customerId : undefined;
    const email = typeof args.email === "string" ? args.email : undefined;

    if (!phone && !customerId && !email) {
      const customer = await this.customerService.getCustomerById(
        context.workspaceId,
        context.customerId,
      );

      return {
        content: JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          language: customer.language,
        }),
      };
    }

    const customer = await this.customerService.findByIdentifier(
      context.workspaceId,
      { customerId, phone, email },
    );

    if (!customer) {
      return { content: JSON.stringify({ found: false }) };
    }

    const [previousConversations, notes, lastOrder] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { workspaceId: context.workspaceId, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: RECENT_CONVERSATIONS_LIMIT,
        select: { id: true, status: true, createdAt: true },
      }),
      this.crmNoteService.listRecentForCustomer(context.workspaceId, customer.id),
      this.orderService.getMostRecentOrderForCustomer(
        context.workspaceId,
        customer.id,
      ),
    ]);

    return {
      content: JSON.stringify({
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          language: customer.language,
          tags: customer.tags,
        },
        previousConversations,
        notes: notes.map((note) => ({
          id: note.id,
          content: note.content,
          createdAt: note.createdAt,
        })),
        lastOrder: lastOrder
          ? {
              id: lastOrder.id,
              marketplace: lastOrder.marketplace,
              status: lastOrder.status,
              totalAmount: lastOrder.totalAmount,
              currency: lastOrder.currency,
              createdAt: lastOrder.createdAt,
            }
          : null,
      }),
    };
  }
}
