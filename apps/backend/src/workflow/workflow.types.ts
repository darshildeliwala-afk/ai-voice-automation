import { WorkflowNodeType } from "../generated/prisma/client";

/**
 * A node in a workflow graph, decoupled from the Prisma WorkflowNode row
 * (no id/timestamps) so the same shape can represent both DB-backed nodes
 * and the in-memory DEFAULT_WORKFLOW_NODES fallback below.
 */
export interface WorkflowGraphNode {
  key: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
}

export interface WorkflowGraph {
  entryNodeKey: string;
  nodes: WorkflowGraphNode[];
}

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "exists"
  | "notExists"
  | "greaterThan"
  | "lessThan";

export const CONDITION_OPERATORS: ConditionOperator[] = [
  "equals",
  "notEquals",
  "contains",
  "exists",
  "notExists",
  "greaterThan",
  "lessThan",
];

/** PROMPT/TOOL/CALLBACK nodes: `next` is optional -- absent means terminal. */
export interface PromptNodeConfig {
  promptOverride?: string;
  allowTools?: boolean;
  next?: string;
}

export interface ConditionNodeConfig {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  whenTrue: string;
  whenFalse: string;
}

export interface ToolNodeConfig {
  toolName: string;
  arguments?: Record<string, unknown>;
  next?: string;
}

export interface EndNodeConfig {
  reason?: string;
}

export interface HumanTransferNodeConfig {
  reason?: string;
}

export interface CallbackNodeConfig {
  /** ISO-8601 date-time. Takes precedence over scheduledInMinutes when both are set. */
  scheduledAt?: string;
  /** Minutes from now the callback should be scheduled for. */
  scheduledInMinutes?: number;
  next?: string;
}

/**
 * The built-in single-node graph used whenever a workspace/agent has no
 * custom workflow configured. Reproduces the exact Sprint 15 behavior (a
 * single dynamic tool-calling turn against the model) so existing
 * conversations keep working unchanged until a real Workflow is published --
 * the ConversationEngine always executes a workflow, never hardcoded logic,
 * this is just the trivial default graph.
 */
export const DEFAULT_ENTRY_NODE_KEY = "start";

export const DEFAULT_WORKFLOW_NODES: WorkflowGraphNode[] = [
  {
    key: DEFAULT_ENTRY_NODE_KEY,
    type: WorkflowNodeType.PROMPT,
    config: { allowTools: true } satisfies PromptNodeConfig,
  },
];

export const DEFAULT_WORKFLOW_GRAPH: WorkflowGraph = {
  entryNodeKey: DEFAULT_ENTRY_NODE_KEY,
  nodes: DEFAULT_WORKFLOW_NODES,
};
