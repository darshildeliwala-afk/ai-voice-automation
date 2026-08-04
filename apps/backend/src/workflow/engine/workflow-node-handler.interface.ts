import type {
  ChatMessage,
  IAIProvider,
} from "../../ai/interfaces/ai-provider.interface";
import type { AiProvider, WorkflowNodeType } from "../../generated/prisma/client";
import type { WorkflowGraphNode } from "../workflow.types";

/**
 * Shared, mutable execution state for one workflow run (one user turn).
 * `messages` and `state` are threaded through every node so a PROMPT node's
 * output is visible to a later CONDITION node, and vice versa. Available
 * AI tools are not part of this context -- PromptNodeHandler resolves them
 * directly from AIToolRegistry, the same source of truth TOOL/END/
 * HUMAN_TRANSFER/CALLBACK node handlers use.
 */
export interface WorkflowExecutionContext {
  workspaceId: string;
  customerId: string;
  conversationId: string;
  orderId?: string;
  aiAgentId?: string;
  provider: IAIProvider;
  providerName: AiProvider;
  messages: ChatMessage[];
  state: Record<string, unknown>;
  /** Barge-in hook (Sprint 18): cancels any in-flight provider.chat() call when the customer starts speaking mid-turn. */
  abortSignal?: AbortSignal;
}

export interface WorkflowNodeUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface WorkflowNodeExecutionResult {
  /** Key of the next node to execute. Absent/undefined => terminal. */
  next?: string;
  /** Forces termination even if `next` is set (e.g. a dynamic end_call tool call mid-PROMPT-node). */
  terminal?: boolean;
  /** User-visible assistant content this node produced, if any. */
  content?: string;
  toolCallsExecuted?: string[];
  /** One entry per provider call this node made (a PROMPT node may make several within its own tool-calling loop). */
  usage?: WorkflowNodeUsage[];
  /** Merged into WorkflowExecutionContext.state after this node runs. */
  stateUpdates?: Record<string, unknown>;
}

export interface IWorkflowNodeHandler {
  type(): WorkflowNodeType;
  execute(
    node: WorkflowGraphNode,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeExecutionResult>;
}
