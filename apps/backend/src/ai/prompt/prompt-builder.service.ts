import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CustomerService } from "../../customer/customer.service";
import { KnowledgeBaseService } from "../../knowledge-base/knowledge-base.service";
import { AiAgentService } from "../../ai-agent/ai-agent.service";
import { OrderService } from "../../order/order.service";
import { WorkspaceSettingsService } from "../../workspace-settings/workspace-settings.service";
import type { ChatMessage } from "../interfaces/ai-provider.interface";

const BASE_SYSTEM_PROMPT =
  "You are an AI voice assistant representing a business on an outbound " +
  "phone call. Be concise, polite, and stay strictly within the context " +
  "provided below. Never invent order or account details that are not " +
  "given to you.";

export interface PromptBuilderInput {
  workspaceId: string;
  customerId: string;
  orderId?: string;
  aiAgentId?: string;
  conversationId?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  history: ChatMessage[];
}

/**
 * Assembles the full context an AI provider needs for a turn: a single
 * combined system prompt (base instructions + workspace + agent +
 * knowledge base + customer + order context) plus prior conversation
 * history as a normal chat-message array. Reads exclusively from existing
 * services (WorkspaceSettingsService, AiAgentService, KnowledgeBaseService,
 * CustomerService, OrderService) -- no new fields were added to any of
 * those models for this.
 */
@Injectable()
export class PromptBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly aiAgentService: AiAgentService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly customerService: CustomerService,
    private readonly orderService: OrderService,
  ) {}

  async build(input: PromptBuilderInput): Promise<BuiltPrompt> {
    const sections: string[] = [BASE_SYSTEM_PROMPT];

    sections.push(await this.buildWorkspaceSection(input.workspaceId));

    if (input.aiAgentId) {
      const { agentSection, knowledgeBaseSection } =
        await this.buildAgentSections(input.workspaceId, input.aiAgentId);
      if (agentSection) sections.push(agentSection);
      if (knowledgeBaseSection) sections.push(knowledgeBaseSection);
    }

    sections.push(
      await this.buildCustomerSection(input.workspaceId, input.customerId),
    );

    if (input.orderId) {
      sections.push(
        await this.buildOrderSection(input.workspaceId, input.orderId),
      );
    }

    const history = input.conversationId
      ? await this.buildHistory(input.conversationId)
      : [];

    return {
      systemPrompt: sections.filter((section) => section.length > 0).join("\n\n"),
      history,
    };
  }

  private async buildWorkspaceSection(workspaceId: string): Promise<string> {
    const settings = await this.workspaceSettingsService.getSettings(workspaceId);

    const lines: string[] = [];
    if (settings.businessName) lines.push(`Business name: ${settings.businessName}`);
    if (settings.website) lines.push(`Website: ${settings.website}`);
    if (settings.address) lines.push(`Address: ${settings.address}`);
    if (settings.businessHours) {
      lines.push(`Business hours: ${JSON.stringify(settings.businessHours)}`);
    }
    lines.push(`Timezone: ${settings.timezone}`);
    lines.push(`Currency: ${settings.currency}`);
    lines.push(`Language: ${settings.language}`);

    return `# Workspace\n${lines.join("\n")}`;
  }

  private async buildAgentSections(
    workspaceId: string,
    aiAgentId: string,
  ): Promise<{ agentSection: string; knowledgeBaseSection: string }> {
    const agent = await this.aiAgentService.getAiAgentById(aiAgentId);

    // AiAgentService.getAiAgentById() only verifies the owning workspace
    // still exists, not that it matches the caller's -- enforce that here,
    // mirroring the same defensive pattern TelephonyService uses for the
    // analogous OrderService gap below.
    if (agent.workspaceId !== workspaceId) {
      throw new NotFoundException(`AI Agent ${aiAgentId} not found`);
    }

    const agentLines: string[] = [`Agent name: ${agent.name}`];
    if (agent.systemPrompt) agentLines.push(agent.systemPrompt);
    if (agent.greeting) agentLines.push(`Greeting: ${agent.greeting}`);
    const agentSection = `# AI Agent\n${agentLines.join("\n")}`;

    let knowledgeBaseSection = "";
    if (agent.knowledgeBaseId) {
      const knowledgeBase = await this.knowledgeBaseService.getKnowledgeBaseById(
        agent.knowledgeBaseId,
      );
      const kbLines: string[] = [`Title: ${knowledgeBase.title}`];
      if (knowledgeBase.description) kbLines.push(knowledgeBase.description);
      if (knowledgeBase.content) kbLines.push(knowledgeBase.content);
      knowledgeBaseSection = `# Knowledge Base\n${kbLines.join("\n")}`;
    }

    return { agentSection, knowledgeBaseSection };
  }

  private async buildCustomerSection(
    workspaceId: string,
    customerId: string,
  ): Promise<string> {
    const customer = await this.customerService.getCustomerById(
      workspaceId,
      customerId,
    );

    const lines: string[] = [`Name: ${customer.name}`, `Phone: ${customer.phone}`];
    if (customer.email) lines.push(`Email: ${customer.email}`);
    if (customer.language) lines.push(`Preferred language: ${customer.language}`);

    return `# Customer\n${lines.join("\n")}`;
  }

  private async buildOrderSection(
    workspaceId: string,
    orderId: string,
  ): Promise<string> {
    const order = await this.orderService.getOrderById(orderId);

    // OrderService.getOrderById() is not workspace-scoped -- enforce it
    // here (same pattern TelephonyService already uses for this exact gap).
    if (order.workspaceId !== workspaceId) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const lines: string[] = [
      `Marketplace: ${order.marketplace}`,
      `Status: ${order.status}`,
      `Payment type: ${order.paymentType}`,
      `Total: ${order.totalAmount} ${order.currency}`,
    ];
    if (order.marketplaceOrderId) {
      lines.push(`Order reference: ${order.marketplaceOrderId}`);
    }
    if (order.items.length > 0) {
      const itemLines = order.items.map(
        (item) => `  - ${item.name} x${item.quantity} @ ${item.unitPrice}`,
      );
      lines.push("Items:", ...itemLines);
    }

    return `# Order\n${lines.join("\n")}`;
  }

  private async buildHistory(conversationId: string): Promise<ChatMessage[]> {
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    return messages
      .filter((message) => message.role !== "SYSTEM")
      .map((message) => ({
        role: message.role === "USER" ? "user" : "assistant",
        content: message.content,
      }));
  }
}
