import { Injectable, NotFoundException } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  ConversationRole,
  ConversationStatus,
  type AiProvider,
  type Prisma,
} from "../generated/prisma/client";
import { AiProviderConfigService } from "../workspace-settings/ai-provider-config.service";
import { AIProviderFactory } from "./providers/ai-provider.factory";
import { estimateCost } from "./pricing/ai-pricing";
import { PromptBuilderService } from "./prompt/prompt-builder.service";
import type { ChatMessage } from "./interfaces/ai-provider.interface";

export interface SendMessageInput {
  workspaceId: string;
  customerId: string;
  message: string;
  orderId?: string;
  aiAgentId?: string;
  /** Continues an existing conversation; a new one is created when omitted. */
  conversationId?: string;
}

export interface SendMessageResult {
  conversationId: string;
  content: string;
  provider: AiProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

@Injectable()
export class AIService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: AIProviderFactory,
    private readonly promptBuilder: PromptBuilderService,
    private readonly aiProviderConfigService: AiProviderConfigService,
  ) {
    super();
  }

  /**
   * Resolves the workspace's active AI provider, builds the full prompt
   * (system context + prior history), sends the request, persists the
   * conversation turn and usage record, and returns the response.
   */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const conversation = await this.resolveConversation(input);

    const provider = await this.providerFactory.createForWorkspace(
      input.workspaceId,
    );

    const { systemPrompt, history } = await this.promptBuilder.build({
      workspaceId: input.workspaceId,
      customerId: input.customerId,
      orderId: input.orderId,
      aiAgentId: input.aiAgentId,
      conversationId: conversation.id,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: input.message },
    ];

    const completion = await provider.chat({ messages });

    // Re-derive which provider actually served this request from the same
    // service used to resolve credentials -- avoids a second, separate
    // source of truth for "which provider is active".
    const config = await this.aiProviderConfigService.getActiveConfig(
      input.workspaceId,
    );
    const providerName = this.throwIfNotFound(
      config,
      "AiProviderConfig",
      input.workspaceId,
    ).provider;

    const cost = estimateCost(
      providerName,
      completion.model,
      completion.promptTokens,
      completion.completionTokens,
    );

    await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: ConversationRole.USER,
          content: input.message,
        },
      }),
      this.prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: ConversationRole.ASSISTANT,
          content: completion.content,
          metadata: completion.rawResponse as Prisma.InputJsonValue,
        },
      }),
      this.prisma.aIUsage.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          provider: providerName,
          model: completion.model,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          totalTokens: completion.totalTokens,
          estimatedCost: cost,
        },
      }),
    ]);

    return {
      conversationId: conversation.id,
      content: completion.content,
      provider: providerName,
      model: completion.model,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      estimatedCost: cost,
    };
  }

  private async resolveConversation(input: SendMessageInput) {
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
        status: ConversationStatus.ACTIVE,
      },
    });
  }
}
