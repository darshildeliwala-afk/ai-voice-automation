import { Injectable } from "@nestjs/common";

import { BaseService } from "../common/base/base.service";
import type { PaginationDto } from "../common/pagination/pagination.dto";
import {
  buildPaginationMeta,
  type PaginationMeta,
} from "../common/pagination/pagination.util";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  ConversationRole,
  type Conversation,
  type ConversationMessage,
  type ConversationSummary,
} from "../generated/prisma/client";
import { WorkspaceService } from "../workspace/workspace.service";

export interface PaginatedConversations {
  data: Conversation[];
  meta: PaginationMeta;
}

export interface ConversationMessageEntry {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

export interface ToolCallEntry {
  toolName: string;
  input: unknown;
  output: unknown;
  createdAt: string;
}

export interface ConversationUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  avgLatencyMs: number | null;
}

export interface ConversationDetail {
  id: string;
  customerId: string;
  orderId: string | null;
  aiAgentId: string | null;
  callId: string | null;
  status: string;
  language: string | null;
  sentiment: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessageEntry[];
  toolCalls: ToolCallEntry[];
  usage: ConversationUsageSummary;
  summary: ConversationSummary | null;
}

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/**
 * Read-only admin controller support (Sprint 20) -- distinct from
 * ConversationEngineService, which is the turn-processing engine
 * (unchanged). Surfaces Conversation/ConversationMessage/AIUsage for the
 * admin Conversation Detail view; nothing here writes.
 */
@Injectable()
export class ConversationService extends BaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    super();
  }

  async listConversations(
    workspaceId: string,
    pagination: PaginationDto,
    customerId?: string,
  ): Promise<PaginatedConversations> {
    await this.workspaceService.getWorkspaceById(workspaceId);

    const { skip, take, orderBy } = this.buildPagination(pagination);
    const where = { workspaceId, ...(customerId ? { customerId } : {}) };

    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({ where, skip, take, orderBy }),
      this.prisma.conversation.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, pagination) };
  }

  /** Scoped to workspaceId -- a conversation belonging to another workspace is treated as not found (Sprint 21 tenant-isolation fix). */
  async getConversationDetail(
    workspaceId: string,
    id: string,
  ): Promise<ConversationDetail> {
    const conversation = this.throwIfNotFound(
      await this.prisma.conversation.findFirst({
        where: { id, workspaceId },
        include: { summary: true },
      }),
      "Conversation",
      id,
    );

    const [messages, usageRecords] = await Promise.all([
      this.prisma.conversationMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.aIUsage.findMany({ where: { conversationId: id } }),
    ]);

    const latencies = usageRecords
      .map((record) => record.latencyMs)
      .filter((latency): latency is number => latency !== null);

    return {
      id: conversation.id,
      customerId: conversation.customerId,
      orderId: conversation.orderId,
      aiAgentId: conversation.aiAgentId,
      callId: conversation.callId,
      status: conversation.status,
      language: conversation.language,
      sentiment: conversation.sentiment,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
      toolCalls: this.pairToolCalls(messages),
      usage: {
        promptTokens: sumBy(usageRecords, (record) => record.promptTokens),
        completionTokens: sumBy(usageRecords, (record) => record.completionTokens),
        totalTokens: sumBy(usageRecords, (record) => record.totalTokens),
        estimatedCost: sumBy(usageRecords, (record) => Number(record.estimatedCost)),
        avgLatencyMs:
          latencies.length > 0
            ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
            : null,
      },
      summary: conversation.summary,
    };
  }

  /**
   * Joins each TOOL_CALL message's `metadata.toolCalls[]` entries to their
   * TOOL_RESULT messages via `toolCallId` (see persist-conversation-
   * message.ts / prompt-node.handler.ts -- both write this exact shape,
   * whether the model or the workflow graph decided to call the tool) --
   * a real key-based join, not positional guessing, since every
   * TOOL_RESULT message already carries the id of the call it answers.
   */
  private pairToolCalls(messages: ConversationMessage[]): ToolCallEntry[] {
    const resultsByCallId = new Map<string, ConversationMessage>();
    for (const message of messages) {
      if (message.role !== ConversationRole.TOOL_RESULT) continue;
      const metadata = message.metadata as { toolCallId?: string } | null;
      if (metadata?.toolCallId) {
        resultsByCallId.set(metadata.toolCallId, message);
      }
    }

    const entries: ToolCallEntry[] = [];
    for (const message of messages) {
      if (message.role !== ConversationRole.TOOL_CALL) continue;
      const metadata = message.metadata as
        | { toolCalls?: { id: string; name: string; arguments: unknown }[] }
        | null;

      for (const call of metadata?.toolCalls ?? []) {
        const resultMessage = resultsByCallId.get(call.id);
        entries.push({
          toolName: call.name,
          input: call.arguments,
          output: resultMessage ? tryParseJson(resultMessage.content) : null,
          createdAt: message.createdAt.toISOString(),
        });
      }
    }

    return entries;
  }
}

function sumBy<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((sum, item) => sum + select(item), 0);
}
