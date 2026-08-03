import { Injectable } from "@nestjs/common";

import { CustomerService } from "../../customer/customer.service";
import type {
  AIToolExecutionContext,
  AIToolExecutionResult,
  AIToolParameterSchema,
  IAITool,
} from "./ai-tool.interface";

/**
 * Looks up the customer bound to the current conversation. Deliberately
 * takes no customerId parameter -- always resolves context.customerId, so
 * the model can never make it look up an arbitrary customer (workspace-
 * scoped by construction, not by trusting model-supplied input).
 */
@Injectable()
export class LookupCustomerTool implements IAITool {
  constructor(private readonly customerService: CustomerService) {}

  name(): string {
    return "lookup_customer";
  }

  description(): string {
    return "Retrieves the current customer's name, phone, email, and preferred language.";
  }

  parameters(): AIToolParameterSchema {
    return { type: "object", properties: {}, required: [] };
  }

  async execute(
    _args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult> {
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
}
