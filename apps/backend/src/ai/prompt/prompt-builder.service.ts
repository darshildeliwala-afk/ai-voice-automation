import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CustomerService } from "../../customer/customer.service";
import { KnowledgeBaseService } from "../../knowledge-base/knowledge-base.service";
import { AiAgentService } from "../../ai-agent/ai-agent.service";
import { OrderService } from "../../order/order.service";
import { VoicePersonaConfigService } from "../../workspace-settings/voice-persona-config.service";
import { WorkspaceSettingsService } from "../../workspace-settings/workspace-settings.service";
import type { ChatMessage } from "../interfaces/ai-provider.interface";
import { buildPersonaPrompt } from "./persona-prompt.builder";

export interface PromptBuilderInput {
  workspaceId: string;
  customerId: string;
  orderId?: string;
  aiAgentId?: string;
  conversationId?: string;
  /** Language already resolved for this turn (e.g. by LanguageDetectionService); falls back to the persona's default when omitted. */
  resolvedLanguage?: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  history: ChatMessage[];
  /** The language actually used to frame the persona section -- never undefined, defaults to the resolved persona's language. */
  resolvedLanguage: string;
  /** Structured pause-timing data (Sprint 18 voice persona) for a future TTS-streaming layer to consume between synthesized chunks -- not prose in the prompt itself. */
  pauseDurationsMs: { short: number; medium: number; long: number };
}

/**
 * Assembles the full context an AI provider needs for a turn: a single
 * combined system prompt (persona/behavior instructions + workspace +
 * agent + knowledge base + customer + order context) plus prior
 * conversation history as a normal chat-message array. Reads exclusively
 * from existing services (VoicePersonaConfigService, WorkspaceSettingsService,
 * AiAgentService, KnowledgeBaseService, CustomerService, OrderService).
 * The persona section (Sprint 18) replaces what used to be a single
 * hardcoded BASE_SYSTEM_PROMPT constant -- all of that prose is now
 * assembled from a resolved VoicePersonaConfig via buildPersonaPrompt().
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
    private readonly voicePersonaConfigService: VoicePersonaConfigService,
  ) {}

  async build(input: PromptBuilderInput): Promise<BuiltPrompt> {
    const { personaSection, resolvedLanguage, pauseDurationsMs } =
      await this.buildPersonaSection(input.workspaceId, input.aiAgentId, input.resolvedLanguage);
    const sections: string[] = [personaSection];

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
      resolvedLanguage,
      pauseDurationsMs,
    };
  }

  private async buildPersonaSection(
    workspaceId: string,
    aiAgentId: string | undefined,
    resolvedLanguage: string | undefined,
  ): Promise<{
    personaSection: string;
    resolvedLanguage: string;
    pauseDurationsMs: { short: number; medium: number; long: number };
  }> {
    const persona = await this.voicePersonaConfigService.resolveEffectiveConfig(
      workspaceId,
      aiAgentId,
    );
    const effectiveLanguage = resolvedLanguage ?? persona.language;

    const personaSection = buildPersonaPrompt({
      tone: persona.tone,
      language: effectiveLanguage,
      warmth: persona.warmth,
      professionalism: persona.professionalism,
      fillerWordsEnabled: persona.fillerWordsEnabled,
      maxResponseLength: persona.maxResponseLength,
      greetingStyle: persona.greetingStyle,
      closingStyle: persona.closingStyle,
    });

    return {
      personaSection,
      resolvedLanguage: effectiveLanguage,
      pauseDurationsMs: {
        short: persona.pauseShortMs,
        medium: persona.pauseMediumMs,
        long: persona.pauseLongMs,
      },
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
