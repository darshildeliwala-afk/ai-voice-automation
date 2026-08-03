import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { WorkflowExecutionContext } from "../workflow-node-handler.interface";
import { ToolNodeHandler } from "./tool-node.handler";

function setup() {
  const conversationMessage = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { conversationMessage };
  const toolExecutor = { execute: jest.fn() };
  const handler = new ToolNodeHandler(prisma as never, toolExecutor as never);

  const context: WorkflowExecutionContext = {
    workspaceId: "workspace-1",
    customerId: "customer-1",
    conversationId: "conv-1",
    orderId: "order-1",
    provider: { chat: jest.fn() } as never,
    providerName: "OPENAI" as never,
    messages: [],
    state: {},
  };

  return { handler, conversationMessage, toolExecutor, context };
}

describe("ToolNodeHandler", () => {
  it("invokes the configured tool with templated arguments resolved from context", async () => {
    const { handler, toolExecutor, context } = setup();
    toolExecutor.execute.mockResolvedValue({ content: '{"status":"SHIPPED"}' });

    const node = {
      key: "lookup",
      type: WorkflowNodeType.TOOL,
      config: { toolName: "lookup_order", arguments: { orderId: "{{orderId}}" }, next: "next-node" },
    };

    const result = await handler.execute(node, context);

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      { id: expect.stringContaining("workflow-lookup-"), name: "lookup_order", arguments: { orderId: "order-1" } },
      { workspaceId: "workspace-1", customerId: "customer-1", conversationId: "conv-1", orderId: "order-1", aiAgentId: undefined },
    );
    expect(result.next).toBe("next-node");
    expect(result.toolCallsExecuted).toEqual(["lookup_order"]);
  });

  it("stores the parsed JSON tool result under state[node.key]", async () => {
    const { handler, toolExecutor, context } = setup();
    toolExecutor.execute.mockResolvedValue({ content: '{"status":"SHIPPED"}' });

    const node = { key: "lookup", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order" } };
    const result = await handler.execute(node, context);

    expect(result.stateUpdates).toEqual({ lookup: { status: "SHIPPED" } });
  });

  it("falls back to the raw string when the tool result is not valid JSON", async () => {
    const { handler, toolExecutor, context } = setup();
    toolExecutor.execute.mockResolvedValue({ content: "not json" });

    const node = { key: "lookup", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order" } };
    const result = await handler.execute(node, context);

    expect(result.stateUpdates).toEqual({ lookup: "not json" });
  });

  it("persists TOOL_CALL and TOOL_RESULT messages", async () => {
    const { handler, toolExecutor, context, conversationMessage } = setup();
    toolExecutor.execute.mockResolvedValue({ content: "{}" });

    const node = { key: "lookup", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order" } };
    await handler.execute(node, context);

    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "TOOL_CALL" }),
    });
    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "TOOL_RESULT" }),
    });
  });

  it("terminates and ignores config.next when the tool result is terminal", async () => {
    const { handler, toolExecutor, context } = setup();
    toolExecutor.execute.mockResolvedValue({ content: "{}", terminal: true });

    const node = {
      key: "end_it",
      type: WorkflowNodeType.TOOL,
      config: { toolName: "end_call", next: "unreachable" },
    };
    const result = await handler.execute(node, context);

    expect(result.terminal).toBe(true);
    expect(result.next).toBeUndefined();
  });
});
