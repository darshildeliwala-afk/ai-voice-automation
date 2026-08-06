import { Injectable } from "@nestjs/common";

import { WorkflowNodeType } from "../../generated/prisma/client";
import {
  CONDITION_OPERATORS,
  type ConditionNodeConfig,
  type ConditionOperator,
  type WorkflowGraphNode,
} from "../workflow.types";

/** `exists`/`notExists` are the only operators that don't compare against a configured `value` -- see condition-evaluator.ts. */
const OPERATORS_REQUIRING_VALUE: ReadonlySet<ConditionOperator> = new Set([
  "equals",
  "notEquals",
  "contains",
  "greaterThan",
  "lessThan",
]);

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates a workflow's full node graph before it can be published:
 * structural integrity (unique keys, no dangling edges, every node
 * reachable from the entry, at least one reachable terminal) plus
 * per-type config shape. TOOL nodes are additionally checked against the
 * live AIToolRegistry (see WorkflowService.publish) so a workflow can
 * never reference a tool that doesn't exist.
 */
@Injectable()
export class WorkflowValidatorService {
  validate(
    nodes: WorkflowGraphNode[],
    entryNodeKey: string | null | undefined,
    knownToolNames?: string[],
  ): WorkflowValidationResult {
    const errors: string[] = [];

    if (nodes.length === 0) {
      return { valid: false, errors: ["Workflow must have at least one node"] };
    }

    if (!isNonEmptyString(entryNodeKey)) {
      errors.push("Workflow must have an entryNodeKey");
    }

    const nodesByKey = new Map<string, WorkflowGraphNode>();
    for (const node of nodes) {
      if (!isNonEmptyString(node.key)) {
        errors.push("Every node must have a non-empty key");
        continue;
      }
      if (nodesByKey.has(node.key)) {
        errors.push(`Duplicate node key "${node.key}"`);
        continue;
      }
      nodesByKey.set(node.key, node);
    }

    if (entryNodeKey && !nodesByKey.has(entryNodeKey)) {
      errors.push(`entryNodeKey "${entryNodeKey}" does not reference an existing node`);
    }

    for (const node of nodes) {
      errors.push(...this.validateNodeConfig(node, nodesByKey, knownToolNames));
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const { reachable, terminalReachable } = this.walkGraph(
      nodesByKey,
      entryNodeKey as string,
    );

    for (const key of nodesByKey.keys()) {
      if (!reachable.has(key)) {
        errors.push(`Node "${key}" is unreachable from the entry node`);
      }
    }

    if (!terminalReachable) {
      errors.push(
        "Workflow has no reachable terminal node (END, HUMAN_TRANSFER, or a node with no `next`) -- it would never end",
      );
    }

    return { valid: errors.length === 0, errors };
  }

  private validateNodeConfig(
    node: WorkflowGraphNode,
    nodesByKey: Map<string, WorkflowGraphNode>,
    knownToolNames?: string[],
  ): string[] {
    const errors: string[] = [];
    const config = node.config ?? {};
    const prefix = `Node "${node.key}"`;

    switch (node.type) {
      case WorkflowNodeType.PROMPT:
      case WorkflowNodeType.CALLBACK: {
        const next = config.next;
        if (next !== undefined && !this.referencesExistingNode(next, nodesByKey)) {
          errors.push(`${prefix}: next "${String(next)}" does not reference an existing node`);
        }
        break;
      }
      case WorkflowNodeType.TOOL: {
        if (!isNonEmptyString(config.toolName)) {
          errors.push(`${prefix}: toolName is required`);
        } else if (knownToolNames && !knownToolNames.includes(config.toolName)) {
          errors.push(`${prefix}: unknown tool "${config.toolName}"`);
        }
        const next = config.next;
        if (next !== undefined && !this.referencesExistingNode(next, nodesByKey)) {
          errors.push(`${prefix}: next "${String(next)}" does not reference an existing node`);
        }
        break;
      }
      case WorkflowNodeType.CONDITION: {
        const conditionConfig = config as unknown as Partial<ConditionNodeConfig>;
        if (!isNonEmptyString(conditionConfig.field)) {
          errors.push(`${prefix}: field is required`);
        }
        if (
          !conditionConfig.operator ||
          !CONDITION_OPERATORS.includes(conditionConfig.operator)
        ) {
          errors.push(`${prefix}: operator must be one of ${CONDITION_OPERATORS.join(", ")}`);
        } else if (
          OPERATORS_REQUIRING_VALUE.has(conditionConfig.operator) &&
          conditionConfig.value === undefined
        ) {
          // Without this, an unset `value` against an unresolved `field`
          // path evaluates `undefined === undefined` -> true at runtime,
          // silently taking whenTrue instead of failing safe to whenFalse.
          errors.push(`${prefix}: operator "${conditionConfig.operator}" requires a value`);
        }
        if (!isNonEmptyString(conditionConfig.whenTrue)) {
          errors.push(`${prefix}: whenTrue is required`);
        } else if (!nodesByKey.has(conditionConfig.whenTrue)) {
          errors.push(`${prefix}: whenTrue "${conditionConfig.whenTrue}" does not reference an existing node`);
        }
        if (!isNonEmptyString(conditionConfig.whenFalse)) {
          errors.push(`${prefix}: whenFalse is required`);
        } else if (!nodesByKey.has(conditionConfig.whenFalse)) {
          errors.push(`${prefix}: whenFalse "${conditionConfig.whenFalse}" does not reference an existing node`);
        }
        break;
      }
      case WorkflowNodeType.END:
      case WorkflowNodeType.HUMAN_TRANSFER:
        // config is just an optional `reason` string -- nothing to validate.
        break;
      default:
        errors.push(`${prefix}: unknown node type "${String(node.type)}"`);
    }

    return errors;
  }

  private referencesExistingNode(
    value: unknown,
    nodesByKey: Map<string, WorkflowGraphNode>,
  ): boolean {
    return isNonEmptyString(value) && nodesByKey.has(value);
  }

  private walkGraph(
    nodesByKey: Map<string, WorkflowGraphNode>,
    entryNodeKey: string,
  ): { reachable: Set<string>; terminalReachable: boolean } {
    const reachable = new Set<string>();
    let terminalReachable = false;

    if (!nodesByKey.has(entryNodeKey)) {
      return { reachable, terminalReachable };
    }

    const queue = [entryNodeKey];

    while (queue.length > 0) {
      const key = queue.shift() as string;
      if (reachable.has(key)) {
        continue;
      }
      reachable.add(key);

      const node = nodesByKey.get(key);
      if (!node) {
        continue;
      }

      const nextKeys = this.outgoingKeys(node);
      if (nextKeys.length === 0) {
        terminalReachable = true;
      }

      for (const nextKey of nextKeys) {
        if (nodesByKey.has(nextKey)) {
          queue.push(nextKey);
        }
      }
    }

    return { reachable, terminalReachable };
  }

  private outgoingKeys(node: WorkflowGraphNode): string[] {
    const config = node.config ?? {};

    switch (node.type) {
      case WorkflowNodeType.CONDITION: {
        const conditionConfig = config as unknown as Partial<ConditionNodeConfig>;
        return [conditionConfig.whenTrue, conditionConfig.whenFalse].filter(
          isNonEmptyString,
        );
      }
      case WorkflowNodeType.END:
      case WorkflowNodeType.HUMAN_TRANSFER:
        return [];
      case WorkflowNodeType.PROMPT:
      case WorkflowNodeType.TOOL:
      case WorkflowNodeType.CALLBACK:
      default:
        return isNonEmptyString(config.next) ? [config.next] : [];
    }
  }
}
