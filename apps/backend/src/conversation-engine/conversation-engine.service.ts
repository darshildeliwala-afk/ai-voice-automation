import { Injectable, NotFoundException } from "@nestjs/common";

import { AiAgentService } from "../ai-agent/ai-agent.service";
import { PromptBuilderService } from "../ai/prompt/prompt-builder.service";
import { AIProviderFactory } from "../ai/providers/ai-provider.factory";
import type { ChatMessage } from "../ai/interfaces/ai-provider.interface";
import { BaseService } from "../common/base/base.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { CustomerService } from "../customer/customer.service";
import {
  ConversationRole,
  ConversationStatus,
  type AiProvider,
} from "../generated/prisma/client";
import { OrderService } from "../order/order.service";
import { WorkflowExecutionEngine } from "../workflow/engine/workflow-execution.engine";
import { WorkflowService } from "../workflow/workflow.service";
import { AiProviderConfigService } from "../workspace-settings/ai-provider-config.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { LanguageDetectionService } from "./language-detection.service";

export interface ProcessMessageInput {
  workspaceId: string;
  customerId: string;
  message: string;
  orderId?: string;
  aiAgentId?: string;
  /** Continues an existing conversation; a new one is created when omitted. */
  conversationId?: string;
  /** Links a newly-created conversation to the Call it happened over (ignored when continuing an existing conversation). */
  callId?: string;
  /** Barge-in hook (Sprint 18): aborts the in-flight LLM call if the customer starts speaking mid-turn. */
  abortSignal?: AbortSignal;
}

export interface ProcessMessageResult {
  conversationId: string;
  content: string;
  provider: AiProvider;
  model: string;
  /** Aggregated across every provider call made during this turn (a turn may involve several across PROMPT nodes and tool-calling rounds). */
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  toolCallsExecuted: string[];
  /** Language this turn was framed in -- LanguageDetectionService's match on input.message, or the Conversation's previously-detected language, or the workspace/agent persona's default (Sprint 18). */
  resolvedLanguage: string;
  /** Key of the last workflow node that ran this turn (Sprint 20 Live Call API) -- lets MediaSession persist "what step of the conversation is this call currently at" for the admin Live Call view. */
  lastNodeKey?: string;
}

/**
 * Sits between the Worker (via TelephonyWebhookService's call-answer
 * trigger -- apps/worker itself has no DB access to any of this, see the
 * Sprint 15 architecture note in telephony-webhook.service.ts) and the AI
 * layer. Loads full conversation context, builds the base prompt, then
 * hands off to the Sprint 16 Workflow engine: resolves the AI Agent's
 * active published Workflow (or the workspace default, or the built-in
 * DEFAULT_WORKFLOW_GRAPH if neither is configured -- see
 * WorkflowService.resolveActiveGraph) and executes it via
 * WorkflowExecutionEngine, which walks the node graph instead of any
 * hardcoded loop. Message/usage persistence now happens inside the
 * workflow's node handlers (see src/workflow/engine/handlers).
 */
@Injectable()
export class ConversationEngineService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly customerService: CustomerService,
    private readonly orderService: OrderService,
    private readonly aiAgentService: AiAgentService,
    private readonly providerFactory: AIProviderFactory,
    private readonly promptBuilder: PromptBuilderService,
    private readonly aiProviderConfigService: AiProviderConfigService,
    private readonly workflowService: WorkflowService,
    private readonly workflowExecutionEngine: WorkflowExecutionEngine,
    private readonly languageDetectionService: LanguageDetectionService,
  ) {
    super();
  }

  async processMessage(
    input: ProcessMessageInput,
  ): Promise<ProcessMessageResult> {
    const startedAt = Date.now();

    // Load Workspace -- fail fast if it doesn't exist / is soft-deleted.
    await this.workspaceService.getWorkspaceById(input.workspaceId);

    // Load Customer (workspace-scoped).
    await this.customerService.getCustomerById(
      input.workspaceId,
      input.customerId,
    );

    // Load Order, if bound to this turn (workspace-scoped -- OrderService
    // itself isn't, so this mirrors the defensive check already used by
    // PromptBuilderService/TelephonyService for the same pre-existing gap).
    if (input.orderId) {
      const order = await this.orderService.getOrderById(input.orderId);
      if (order.workspaceId !== input.workspaceId) {
        throw new NotFoundException(`Order ${input.orderId} not found`);
      }
    }

    // Load AI Agent, if bound to this turn (workspace-scoped, same reasoning).
    if (input.aiAgentId) {
      const agent = await this.aiAgentService.getAiAgentById(input.aiAgentId);
      if (agent.workspaceId !== input.workspaceId) {
        throw new NotFoundException(`AI Agent ${input.aiAgentId} not found`);
      }
    }

    // Resolve which provider is active for this workspace (and its name,
    // for usage-record attribution -- re-derived from the same config
    // service used to build credentials, avoiding a second source of
    // truth) BEFORE creating a Conversation row: if the workspace has no
    // AI provider configured at all, fail here rather than leaving behind
    // an orphaned, empty conversation every time a call connects.
    const provider = await this.providerFactory.createForWorkspace(
      input.workspaceId,
    );
    const config = await this.aiProviderConfigService.getActiveConfig(
      input.workspaceId,
    );
    const providerName = this.throwIfNotFound(
      config,
      "AiProviderConfig",
      input.workspaceId,
    ).provider;

    // Load (or create) the Conversation.
    const conversation = await this.resolveConversation(input);

    // Detect an explicit language-preference request in this turn's
    // message ("Hindi mein boliye", "Can we speak in English?") and
    // persist it onto the Conversation the moment it changes, so it's
    // exposed (not buried) for the rest of the call and any future
    // STT/TTS provider to consume (Sprint 18).
    const detection = this.languageDetectionService.detectLanguagePreference(
      input.message,
    );
    if (detection && detection.code !== conversation.language) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { language: detection.code },
      });
    }
    const resolvedLanguageInput =
      detection?.code ?? conversation.language ?? undefined;

    // Build the base prompt (this internally loads AI Agent, Knowledge
    // Base, Customer, Order, and previous conversation history and
    // formats them into a single system prompt + prior-turn messages).
    const { systemPrompt, history, resolvedLanguage } = await this.promptBuilder.build({
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      orderId: input.orderId,
      aiAgentId: input.aiAgentId,
      conversationId: conversation.id,
      resolvedLanguage: resolvedLanguageInput,
    });

    await this.persistMessage(
      conversation.id,
      ConversationRole.USER,
      input.message,
    );

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: input.message },
    ];

    // Resolve and execute the workflow graph -- the AI Agent's own active
    // published Workflow, the workspace default, or the built-in
    // single-node default graph. The ConversationEngine always executes a
    // workflow; there is no separate hardcoded code path.
    const graph = await this.workflowService.resolveActiveGraph(
      input.workspaceId,
      input.aiAgentId,
    );

    const result = await this.workflowExecutionEngine.execute(graph, {
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      conversationId: conversation.id,
      orderId: input.orderId,
      aiAgentId: input.aiAgentId,
      provider,
      providerName,
      messages,
      state: {},
      abortSignal: input.abortSignal,
    });

    return {
      conversationId: conversation.id,
      content: result.content,
      provider: providerName,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      estimatedCost: result.estimatedCost,
      latencyMs: Date.now() - startedAt,
      toolCallsExecuted: result.toolCallsExecuted,
      resolvedLanguage,
      lastNodeKey: result.lastNodeKey,
    };
  }

  private async persistMessage(
    conversationId: string,
    role: ConversationRole,
    content: string,
  ): Promise<void> {
    await this.prisma.conversationMessage.create({
      data: { conversationId, role, content },
    });
  }

  private async resolveConversation(input: ProcessMessageInput) {
    if (input.conversationId) {
      const conversation = this.throwIfNotFound(
        await this.prisma.conversation.findFirst({
          where: { id: input.conversationId, workspaceId: input.workspaceId },
        }),
        "Conversation",
        input.conversationId,
      );

      if (conversation.customerId !== input.customerId) {
        throw new NotFoundException(
          `Conversation ${input.conversationId} not found`,
        );
      }

      return conversation;
    }

    return this.prisma.conversation.create({
      data: {
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        orderId: input.orderId,
        aiAgentId: input.aiAgentId,
        callId: input.callId,
        status: ConversationStatus.ACTIVE,
      },
    });
  }
}
