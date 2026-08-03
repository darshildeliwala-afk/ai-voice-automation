import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AIToolExecutor } from "../../../conversation-engine/tools/ai-tool-executor";
import type { AIToolExecutionContext } from "../../../conversation-engine/tools/ai-tool.interface";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { CallbackNodeConfig, WorkflowGraphNode } from "../../workflow.types";
import { persistToolInteraction } from "../persist-conversation-message";
import type {
  IWorkflowNodeHandler,
  WorkflowExecutionContext,
  WorkflowNodeExecutionResult,
} from "../workflow-node-handler.interface";

const DEFAULT_SCHEDULED_IN_MINUTES = 60;

function resolveScheduledAt(config: CallbackNodeConfig): string {
  if (config.scheduledAt) {
    return config.scheduledAt;
  }

  const minutes = config.scheduledInMinutes ?? DEFAULT_SCHEDULED_IN_MINUTES;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Schedules a callback via the reused create_callback tool, decided by the
 * graph instead of the model. Not inherently terminal -- `next` is
 * typically wired to an END node in the builder, but the graph is free to
 * continue the conversation after scheduling (e.g. tell the customer, then
 * keep talking).
 */
@Injectable()
export class CallbackNodeHandler implements IWorkflowNodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: AIToolExecutor,
  ) {}

  type(): WorkflowNodeType {
    return WorkflowNodeType.CALLBACK;
  }

  async execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = node.config as CallbackNodeConfig;

    const call = {
      id: `workflow-${node.key}-${randomUUID()}`,
      name: "create_callback",
      arguments: { scheduledAt: resolveScheduledAt(config) },
    };
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
      toolCallsExecuted: ["create_callback"],
    };
  }
}
