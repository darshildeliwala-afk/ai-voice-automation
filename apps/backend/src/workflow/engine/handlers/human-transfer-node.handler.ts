import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AIToolExecutor } from "../../../conversation-engine/tools/ai-tool-executor";
import type { AIToolExecutionContext } from "../../../conversation-engine/tools/ai-tool.interface";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { WorkflowNodeType } from "../../../generated/prisma/client";
import type {
  HumanTransferNodeConfig,
  WorkflowGraphNode,
} from "../../workflow.types";
import { persistToolInteraction } from "../persist-conversation-message";
import type {
  IWorkflowNodeHandler,
  WorkflowExecutionContext,
  WorkflowNodeExecutionResult,
} from "../workflow-node-handler.interface";

const DEFAULT_REASON = "Workflow routed this conversation to a human agent.";

/**
 * Structurally terminal: hands the conversation off to a human via the
 * reused transfer_to_human tool, decided by the graph instead of the model.
 */
@Injectable()
export class HumanTransferNodeHandler implements IWorkflowNodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolExecutor: AIToolExecutor,
  ) {}

  type(): WorkflowNodeType {
    return WorkflowNodeType.HUMAN_TRANSFER;
  }

  async execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = node.config as HumanTransferNodeConfig;

    const call = {
      id: `workflow-${node.key}-${randomUUID()}`,
      name: "transfer_to_human",
      arguments: { reason: config.reason ?? DEFAULT_REASON },
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

    return { terminal: true, toolCallsExecuted: ["transfer_to_human"] };
  }
}
