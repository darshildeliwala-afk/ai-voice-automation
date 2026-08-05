import { Injectable, InternalServerErrorException } from "@nestjs/common";

import type { AiProvider } from "../../generated/prisma/client";
import type { WorkflowGraph } from "../workflow.types";
import type { WorkflowExecutionContext } from "./workflow-node-handler.interface";
import { WorkflowNodeHandlerRegistry } from "./workflow-node-handler-registry";

const MAX_WORKFLOW_STEPS = 25;

export interface WorkflowExecutionResult {
  content: string;
  toolCallsExecuted: string[];
  provider: AiProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  stepsExecuted: number;
  /** Key of the last node that actually ran (Sprint 20 Live Call API). Tracked separately from the `currentKey` loop variable -- `currentKey` gets reassigned to `result.next` (the node that *would* run next) before every exit path except the `terminal: true` break, so deriving this from `currentKey` after the loop is wrong for the natural/step-limit exits. Undefined only if the graph had no entry node at all. */
  lastNodeKey?: string;
}

/**
 * Walks a WorkflowGraph from its entry node, dispatching each node to the
 * handler registered for its type (WorkflowNodeHandlerRegistry) and
 * following the `next` key each handler returns until a node reports
 * `terminal` or has no `next` -- or MAX_WORKFLOW_STEPS is hit, a runtime
 * safety net against a misconfigured cyclical graph slipping past
 * WorkflowValidatorService's own reachable-terminal check. Aggregates
 * token/cost usage and executed tool names across every node into the
 * final per-turn totals ConversationEngineService returns.
 */
@Injectable()
export class WorkflowExecutionEngine {
  constructor(private readonly handlerRegistry: WorkflowNodeHandlerRegistry) {}

  async execute(
    graph: WorkflowGraph,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult> {
    const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));

    let currentKey: string | undefined = graph.entryNodeKey;
    let lastExecutedKey: string | undefined;
    let steps = 0;
    let content = "";
    let model = "";
    const toolCallsExecuted: string[] = [];
    const aggregate = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };

    while (currentKey && steps < MAX_WORKFLOW_STEPS) {
      steps++;
      lastExecutedKey = currentKey;

      const node = nodesByKey.get(currentKey);
      if (!node) {
        throw new InternalServerErrorException(
          `Workflow node "${currentKey}" not found in graph`,
        );
      }

      const handler = this.handlerRegistry.getHandler(node.type);
      if (!handler) {
        throw new InternalServerErrorException(
          `No handler registered for workflow node type "${node.type}"`,
        );
      }

      const result = await handler.execute(node, context);

      if (result.content) {
        content = result.content;
      }
      if (result.toolCallsExecuted) {
        toolCallsExecuted.push(...result.toolCallsExecuted);
      }
      if (result.usage) {
        for (const usage of result.usage) {
          aggregate.promptTokens += usage.promptTokens;
          aggregate.completionTokens += usage.completionTokens;
          aggregate.totalTokens += usage.totalTokens;
          aggregate.estimatedCost += usage.estimatedCost;
          model = usage.model;
        }
      }
      if (result.stateUpdates) {
        Object.assign(context.state, result.stateUpdates);
      }

      if (result.terminal) {
        break;
      }

      currentKey = result.next;
    }

    return {
      content,
      toolCallsExecuted,
      provider: context.providerName,
      model,
      ...aggregate,
      stepsExecuted: steps,
      lastNodeKey: lastExecutedKey,
    };
  }
}
