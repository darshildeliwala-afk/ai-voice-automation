import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { WorkflowExecutionContext } from "../workflow-node-handler.interface";
import { CallbackNodeHandler } from "./callback-node.handler";

function setup() {
  const conversationMessage = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { conversationMessage };
  const toolExecutor = {
    execute: jest.fn().mockResolvedValue({ content: '{"scheduled":true}' }),
  };
  const handler = new CallbackNodeHandler(prisma as never, toolExecutor as never);

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

  return { handler, toolExecutor, context };
}

describe("CallbackNodeHandler", () => {
  it("uses a literal scheduledAt when configured", async () => {
    const { handler, toolExecutor, context } = setup();
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();

    const node = {
      key: "cb",
      type: WorkflowNodeType.CALLBACK,
      config: { scheduledAt, next: "end" },
    };
    const result = await handler.execute(node, context);

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: "create_callback", arguments: { scheduledAt } }),
      expect.anything(),
    );
    expect(result).toMatchObject({ next: "end", toolCallsExecuted: ["create_callback"] });
  });

  it("computes scheduledAt from scheduledInMinutes when no literal is given", async () => {
    const { handler, toolExecutor, context } = setup();
    const before = Date.now();

    const node = { key: "cb", type: WorkflowNodeType.CALLBACK, config: { scheduledInMinutes: 30 } };
    await handler.execute(node, context);

    const call = toolExecutor.execute.mock.calls[0][0];
    const scheduledAtMs = new Date(call.arguments.scheduledAt as string).getTime();
    expect(scheduledAtMs).toBeGreaterThanOrEqual(before + 30 * 60_000 - 1000);
    expect(scheduledAtMs).toBeLessThanOrEqual(before + 30 * 60_000 + 5000);
  });

  it("defaults to +60 minutes when no scheduling config is given at all", async () => {
    const { handler, toolExecutor, context } = setup();
    const before = Date.now();

    const node = { key: "cb", type: WorkflowNodeType.CALLBACK, config: {} };
    await handler.execute(node, context);

    const call = toolExecutor.execute.mock.calls[0][0];
    const scheduledAtMs = new Date(call.arguments.scheduledAt as string).getTime();
    expect(scheduledAtMs).toBeGreaterThanOrEqual(before + 60 * 60_000 - 1000);
  });

  it("is not terminal by default, transitioning to config.next", async () => {
    const { handler, context } = setup();

    const node = { key: "cb", type: WorkflowNodeType.CALLBACK, config: { next: "end" } };
    const result = await handler.execute(node, context);

    expect(result.terminal).toBeUndefined();
    expect(result.next).toBe("end");
  });

  it("terminates when the underlying tool result is terminal", async () => {
    const { handler, toolExecutor, context } = setup();
    toolExecutor.execute.mockResolvedValue({ content: "{}", terminal: true });

    const node = { key: "cb", type: WorkflowNodeType.CALLBACK, config: { next: "end" } };
    const result = await handler.execute(node, context);

    expect(result.terminal).toBe(true);
    expect(result.next).toBeUndefined();
  });
});
