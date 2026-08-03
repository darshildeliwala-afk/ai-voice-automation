/** JSON-Schema-shaped parameter description, handed to the model as-is. */
export interface AIToolParameterSchema {
  type: "object";
  properties: Record<
    string,
    { type: string; description: string; enum?: string[] }
  >;
  required?: string[];
}

/** Everything a tool needs to act safely within the calling workspace/conversation. */
export interface AIToolExecutionContext {
  workspaceId: string;
  customerId: string;
  conversationId: string;
  orderId?: string;
  aiAgentId?: string;
}

export interface AIToolExecutionResult {
  /** Fed back to the model as the tool-result message content (JSON-stringify structured data). */
  content: string;
  /** True for tools that end the conversation loop (EndCallTool, TransferToHumanTool) -- no further model turns are requested after this. */
  terminal?: boolean;
}

/**
 * A single callable AI tool. Every tool is workspace-scoped: execute()
 * receives the AIToolExecutionContext derived from the authenticated
 * conversation, never trusts a workspaceId/customerId passed in by the
 * model itself.
 */
export interface IAITool {
  name(): string;
  description(): string;
  parameters(): AIToolParameterSchema;
  execute(
    args: Record<string, unknown>,
    context: AIToolExecutionContext,
  ): Promise<AIToolExecutionResult>;
}
