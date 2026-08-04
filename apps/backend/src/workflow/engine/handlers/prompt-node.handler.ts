import { Injectable } from "@nestjs/common";

import { estimateCost } from "../../../ai/pricing/ai-pricing";
import { AIToolExecutor } from "../../../conversation-engine/tools/ai-tool-executor";
import { AIToolRegistry } from "../../../conversation-engine/tools/ai-tool-registry";
import type { AIToolExecutionContext } from "../../../conversation-engine/tools/ai-tool.interface";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ConversationRole, WorkflowNodeType } from "../../../generated/prisma/client";
import type { PromptNodeConfig, WorkflowGraphNode } from "../../workflow.types";
import { persistMessage } from "../persist-conversation-message";
import type {
  IWorkflowNodeHandler,
  WorkflowExecutionContext,
  WorkflowNodeExecutionResult,
  WorkflowNodeUsage,
} from "../workflow-node-handler.interface";

const MAX_TOOL_ITERATIONS = 5;

/**
 * Lets the model decide what to say (and, unless allowTools:false, which
 * registered AI tools to call) for this step. This is the Sprint 15
 * ConversationEngine tool-calling loop, ported into a workflow node
 * handler -- same bounded iteration, same persisted TOOL_CALL/TOOL_RESULT/
 * ASSISTANT messages, same per-call AIUsage row (with latencyMs) persisted
 * directly by this handler. The returned `usage` entries are for the
 * engine to aggregate into the turn's final totals, not to persist again.
 * A dynamic terminal tool call (end_call/transfer_to_human) ends the whole
 * workflow immediately, regardless of this node's configured `next`.
 */
@Injectable()
export class PromptNodeHandler implements IWorkflowNodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: AIToolExecutor,
    private readonly toolRegistry: AIToolRegistry,
  ) {}

  type(): WorkflowNodeType {
    return WorkflowNodeType.PROMPT;
  }

  async execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = node.config as PromptNodeConfig;

    if (config.promptOverride) {
      context.messages.push({ role: "system", content: config.promptOverride });
    }

    const tools =
      config.allowTools === false ? [] : this.toolRegistry.getToolDefinitions();
    const toolContext: AIToolExecutionContext = {
      workspaceId: context.workspaceId,
      customerId: context.customerId,
      conversationId: context.conversationId,
      orderId: context.orderId,
      aiAgentId: context.aiAgentId,
    };

    const usage: WorkflowNodeUsage[] = [];
    const toolCallsExecuted: string[] = [];
    let content = "";
    let terminal = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const callStartedAt = Date.now();
      const completion = await context.provider.chat({
        messages: context.messages,
        tools,
        signal: context.abortSignal,
      });
      const callLatencyMs = Date.now() - callStartedAt;

      const cost = estimateCost(
        context.providerName,
        completion.model,
        completion.promptTokens,
        completion.completionTokens,
      );
      usage.push({
        model: completion.model,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        estimatedCost: cost,
      });

      await this.prisma.aIUsage.create({
        data: {
          workspaceId: context.workspaceId,
          conversationId: context.conversationId,
          provider: context.providerName,
          model: completion.model,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          totalTokens: completion.totalTokens,
          estimatedCost: cost,
          latencyMs: callLatencyMs,
        },
      });

      if (!completion.toolCalls || completion.toolCalls.length === 0) {
        content = completion.content;
        await persistMessage(
          this.prisma,
          context.conversationId,
          ConversationRole.ASSISTANT,
          content,
        );
        context.messages.push({ role: "assistant", content });
        break;
      }

      await persistMessage(
        this.prisma,
        context.conversationId,
        ConversationRole.TOOL_CALL,
        completion.content,
        { toolCalls: completion.toolCalls },
      );
      context.messages.push({
        role: "assistant",
        content: completion.content,
        toolCalls: completion.toolCalls,
      });

      let stopAfterThisRound = false;

      for (const call of completion.toolCalls) {
        const result = await this.toolExecutor.execute(call, toolContext);
        toolCallsExecuted.push(call.name);

        await persistMessage(
          this.prisma,
          context.conversationId,
          ConversationRole.TOOL_RESULT,
          result.content,
          { toolCallId: call.id, toolName: call.name },
        );
        context.messages.push({
          role: "tool",
          content: result.content,
          toolCallId: call.id,
        });

        if (result.terminal) {
          stopAfterThisRound = true;
        }
      }

      if (stopAfterThisRound) {
        content = completion.content;
        terminal = true;
        break;
      }
    }

    return {
      next: terminal ? undefined : config.next,
      terminal,
      content,
      toolCallsExecuted,
      usage,
    };
  }
}
