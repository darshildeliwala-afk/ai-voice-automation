import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { WorkflowExecutionContext } from "../workflow-node-handler.interface";
import { EndNodeHandler } from "./end-node.handler";

function setup() {
  const conversationMessage = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { conversationMessage };
  const toolExecutor = { execute: jest.fn().mockResolvedValue({ content: '{"ended":true}', terminal: true }) };
  const handler = new EndNodeHandler(prisma as never, toolExecutor as never);

  const context: WorkflowExecutionContext = {
    workspaceId: "workspace-1",
    customerId: "customer-1",
    conversationId: "conv-1",
    provider: { chat: jest.fn() } as never,
    providerName: "OPENAI" as never,
    messages: [],
    state: {},
  };

  return { handler, conversationMessage, toolExecutor, context };
}

describe("EndNodeHandler", () => {
  it("invokes the end_call tool and is always terminal", async () => {
    const { handler, toolExecutor, context } = setup();

    const node = { key: "end", type: WorkflowNodeType.END, config: { reason: "resolved" } };
    const result = await handler.execute(node, context);

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: "end_call", arguments: { reason: "resolved" } }),
      expect.objectContaining({ conversationId: "conv-1" }),
    );
    expect(result).toMatchObject({ terminal: true, toolCallsExecuted: ["end_call"] });
    expect(result.next).toBeUndefined();
  });

  it("omits the reason argument when none is configured", async () => {
    const { handler, toolExecutor, context } = setup();

    const node = { key: "end", type: WorkflowNodeType.END, config: {} };
    await handler.execute(node, context);

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: {} }),
      expect.anything(),
    );
  });

  it("persists the tool-call/tool-result interaction", async () => {
    const { handler, context, conversationMessage } = setup();

    const node = { key: "end", type: WorkflowNodeType.END, config: {} };
    await handler.execute(node, context);

    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "TOOL_CALL" }),
    });
    expect(conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "TOOL_RESULT" }),
    });
  });
});
