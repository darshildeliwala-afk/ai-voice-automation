import { Inject, Injectable } from "@nestjs/common";

import type { WorkflowNodeType } from "../../generated/prisma/client";
import type { IWorkflowNodeHandler } from "./workflow-node-handler.interface";

export const WORKFLOW_NODE_HANDLERS = Symbol("WORKFLOW_NODE_HANDLERS");

/**
 * Holds every registered IWorkflowNodeHandler (injected as an array via the
 * WORKFLOW_NODE_HANDLERS token -- see workflow.module.ts), keyed by node
 * type, for WorkflowExecutionEngine. Mirrors AIToolRegistry's shape from
 * Sprint 15: adding a new node type means adding a handler to the
 * WORKFLOW_NODE_HANDLERS provider factory, nothing else changes.
 */
@Injectable()
export class WorkflowNodeHandlerRegistry {
  private readonly handlersByType: Map<WorkflowNodeType, IWorkflowNodeHandler>;

  constructor(
    @Inject(WORKFLOW_NODE_HANDLERS) handlers: IWorkflowNodeHandler[],
  ) {
    this.handlersByType = new Map(handlers.map((handler) => [handler.type(), handler]));
  }

  getHandler(type: WorkflowNodeType): IWorkflowNodeHandler | undefined {
    return this.handlersByType.get(type);
  }
}
