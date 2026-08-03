import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AIToolExecutor } from "../../../conversation-engine/tools/ai-tool-executor";
import type { AIToolExecutionContext } from "../../../conversation-engine/tools/ai-tool.interface";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { ToolNodeConfig, WorkflowGraphNode } from "../../workflow.types";
import { persistToolInteraction } from "../persist-conversation-message";
import { resolveTemplatedArguments } from "../template-resolver";
import type {
  IWorkflowNodeHandler,
  WorkflowExecutionContext,
  WorkflowNodeExecutionResult,
} from "../workflow-node-handler.interface";

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/**
 * Deterministically invokes a specific registered AI tool (not left to the
 * model's discretion, unlike a PROMPT node's dynamic tool calls) via the
 * same AIToolExecutor from Sprint 15, so lookups stay workspace-scoped by
 * construction exactly as they are for model-driven calls. The parsed
 * result is stored under `state[node.key]` for later CONDITION/TOOL nodes.
 */
@Injectable()
export class ToolNodeHandler implements IWorkflowNodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: AIToolExecutor,
  ) {}

  type(): WorkflowNodeType {
    return WorkflowNodeType.TOOL;
  }

  async execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = node.config as unknown as ToolNodeConfig;

    const subject = {
      orderId: context.orderId,
      customerId: context.customerId,
      aiAgentId: context.aiAgentId,
      state: context.state,
    };
    const args = resolveTemplatedArguments(config.arguments, subject);

    const call = { id: `workflow-${node.key}-${randomUUID()}`, name: config.toolName, arguments: args };
    const toolContext: AIToolExecutionContext = {
      workspaceId: context.workspaceId,
      customerId: context.customerId,
      conversationId: context.conversationId,
      orderId: context.orderId,
      aiAgentId: context.aiAgentId,
    };

    const result = await this.toolExecutor.execute(call, toolContext);

    await persistToolInteraction(this.prisma, context.conversationId, call, result);

    return {
      next: result.terminal ? undefined : config.next,
      terminal: result.terminal,
      toolCallsExecuted: [config.toolName],
      stateUpdates: { [node.key]: tryParseJson(result.content) },
    };
  }
}
