import { Injectable, NotFoundException } from "@nestjs/common";

import { AiAgentService } from "../ai-agent/ai-agent.service";
import { estimateCost } from "../ai/pricing/ai-pricing";
import { PromptBuilderService } from "../ai/prompt/prompt-builder.service";
import { AIProviderFactory } from "../ai/providers/ai-provider.factory";
import type {
  ChatMessage,
  ToolCallRequest,
} from "../ai/interfaces/ai-provider.interface";
import { BaseService } from "../common/base/base.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { CustomerService } from "../customer/customer.service";
import {
  ConversationRole,
  ConversationStatus,
  type AiProvider,
  type Prisma,
} from "../generated/prisma/client";
import { OrderService } from "../order/order.service";
import { AiProviderConfigService } from "../workspace-settings/ai-provider-config.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { AIToolExecutor } from "./tools/ai-tool-executor";
import { AIToolRegistry } from "./tools/ai-tool-registry";

const MAX_TOOL_ITERATIONS = 5;

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
}

export interface ProcessMessageResult {
  conversationId: string;
  content: string;
  provider: AiProvider;
  model: string;
  /** Aggregated across every provider call made during this turn (a turn may involve several when tools are used). */
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  toolCallsExecuted: string[];
}

/**
 * Sits between the Worker (via TelephonyWebhookService's call-answer
 * trigger -- apps/worker itself has no DB access to any of this, see the
 * Sprint 15 architecture note in telephony-webhook.service.ts) and the
 * Sprint 14 AI layer. Loads full conversation context, builds the prompt,
 * runs the tool-calling loop against the resolved provider, and persists
 * every message (user/assistant/tool-call/tool-result) plus one AIUsage
 * row per provider call.
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
    private readonly toolRegistry: AIToolRegistry,
    private readonly toolExecutor: AIToolExecutor,
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

    // Build the prompt (this internally loads AI Agent, Knowledge Base,
    // Customer, Order, and previous conversation history and formats them
    // into a single system prompt + prior-turn messages).
    const { systemPrompt, history } = await this.promptBuilder.build({
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      orderId: input.orderId,
      aiAgentId: input.aiAgentId,
      conversationId: conversation.id,
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

    const tools = this.toolRegistry.getToolDefinitions();
    const toolContext = {
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      conversationId: conversation.id,
      orderId: input.orderId,
      aiAgentId: input.aiAgentId,
    };

    const aggregate = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };
    const toolCallsExecuted: string[] = [];
    let finalContent = "";
    let finalModel = "";

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const callStartedAt = Date.now();
      const completion = await provider.chat({ messages, tools });
      const callLatencyMs = Date.now() - callStartedAt;

      finalModel = completion.model;
      const cost = estimateCost(
        providerName,
        completion.model,
        completion.promptTokens,
        completion.completionTokens,
      );

      aggregate.promptTokens += completion.promptTokens;
      aggregate.completionTokens += completion.completionTokens;
      aggregate.totalTokens += completion.totalTokens;
      aggregate.estimatedCost += cost;

      await this.prisma.aIUsage.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          provider: providerName,
          model: completion.model,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          totalTokens: completion.totalTokens,
          estimatedCost: cost,
          latencyMs: callLatencyMs,
        },
      });

      if (!completion.toolCalls || completion.toolCalls.length === 0) {
        finalContent = completion.content;
        await this.persistMessage(
          conversation.id,
          ConversationRole.ASSISTANT,
          finalContent,
        );
        break;
      }

      await this.persistMessage(
        conversation.id,
        ConversationRole.TOOL_CALL,
        completion.content,
        { toolCalls: completion.toolCalls },
      );
      messages.push({
        role: "assistant",
        content: completion.content,
        toolCalls: completion.toolCalls,
      });

      let stopAfterThisRound = false;

      for (const call of completion.toolCalls) {
        const result = await this.executeToolCall(call, toolContext);
        toolCallsExecuted.push(call.name);

        await this.persistMessage(
          conversation.id,
          ConversationRole.TOOL_RESULT,
          result.content,
          { toolCallId: call.id, toolName: call.name },
        );
        messages.push({
          role: "tool",
          content: result.content,
          toolCallId: call.id,
        });

        if (result.terminal) {
          stopAfterThisRound = true;
        }
      }

      if (stopAfterThisRound) {
        finalContent = completion.content;
        break;
      }
    }

    return {
      conversationId: conversation.id,
      content: finalContent,
      provider: providerName,
      model: finalModel,
      ...aggregate,
      latencyMs: Date.now() - startedAt,
      toolCallsExecuted,
    };
  }

  private async executeToolCall(
    call: ToolCallRequest,
    context: Parameters<AIToolExecutor["execute"]>[1],
  ) {
    return this.toolExecutor.execute(call, context);
  }

  private async persistMessage(
    conversationId: string,
    role: ConversationRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        role,
        content,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
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
