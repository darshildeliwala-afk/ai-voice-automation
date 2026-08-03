import { Injectable } from "@nestjs/common";

import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { ConditionNodeConfig, WorkflowGraphNode } from "../../workflow.types";
import { evaluateCondition } from "../condition-evaluator";
import type {
  IWorkflowNodeHandler,
  WorkflowExecutionContext,
  WorkflowNodeExecutionResult,
} from "../workflow-node-handler.interface";

/**
 * Pure branch: evaluates `field`/`operator`/`value` against the execution
 * context (orderId/customerId/aiAgentId plus everything accumulated in
 * `state` by prior TOOL nodes) and routes to whenTrue or whenFalse. Never
 * terminal on its own -- both branches are required and validated to
 * reference real nodes (see WorkflowValidatorService).
 */
@Injectable()
export class ConditionNodeHandler implements IWorkflowNodeHandler {
  type(): WorkflowNodeType {
    return WorkflowNodeType.CONDITION;
  }

  execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = node.config as unknown as ConditionNodeConfig;

    const subject = {
      workspaceId: context.workspaceId,
      customerId: context.customerId,
      orderId: context.orderId,
      aiAgentId: context.aiAgentId,
      state: context.state,
      ...context.state,
    };

    const matched = evaluateCondition(
      subject,
      config.field,
      config.operator,
      config.value,
    );

    return Promise.resolve({
      next: matched ? config.whenTrue : config.whenFalse,
    });
  }
}
