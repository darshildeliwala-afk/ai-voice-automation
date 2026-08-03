import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AIToolExecutor } from "../../../conversation-engine/tools/ai-tool-executor";
import type { AIToolExecutionContext } from "../../../conversation-engine/tools/ai-tool.interface";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { EndNodeConfig, WorkflowGraphNode } from "../../workflow.types";
import { persistToolInteraction } from "../persist-conversation-message";
import type {
  IWorkflowNodeHandler,
  WorkflowExecutionContext,
  WorkflowNodeExecutionResult,
} from "../workflow-node-handler.interface";

/**
 * Structurally terminal: ends the workflow (and, via the reused end_call
 * tool, marks the Conversation COMPLETED) exactly like a model-driven
 * end_call tool call would, just decided by the graph instead of the model.
 */
@Injectable()
export class EndNodeHandler implements IWorkflowNodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: AIToolExecutor,
  ) {}

  type(): WorkflowNodeType {
    return WorkflowNodeType.END;
  }

  async execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = node.config as EndNodeConfig;

    const call = {
      id: `workflow-${node.key}-${randomUUID()}`,
      name: "end_call",
      arguments: config.reason ? { reason: config.reason } : {},
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

    return { terminal: true, toolCallsExecuted: ["end_call"] };
  }
}
