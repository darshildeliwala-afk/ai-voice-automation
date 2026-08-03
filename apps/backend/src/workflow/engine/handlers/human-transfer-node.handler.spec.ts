import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { WorkflowExecutionContext } from "../workflow-node-handler.interface";
import { HumanTransferNodeHandler } from "./human-transfer-node.handler";

function setup() {
  const conversationMessage = { create: jest.fn().mockResolvedValue({}) };
  const prisma = { conversationMessage };
  const toolExecutor = {
    execute: jest.fn().mockResolvedValue({ content: '{"transferRequested":true}', terminal: true }),
  };
  const handler = new HumanTransferNodeHandler(prisma as never, toolExecutor as never);

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

describe("HumanTransferNodeHandler", () => {
  it("invokes transfer_to_human with the configured reason and is always terminal", async () => {
    const { handler, toolExecutor, context } = setup();

    const node = {
      key: "transfer",
      type: WorkflowNodeType.HUMAN_TRANSFER,
      config: { reason: "customer requested a manager" },
    };
    const result = await handler.execute(node, context);

    expect(toolExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "transfer_to_human",
        arguments: { reason: "customer requested a manager" },
      }),
      expect.anything(),
    );
    expect(result).toMatchObject({ terminal: true, toolCallsExecuted: ["transfer_to_human"] });
  });

  it("uses a default reason when none is configured", async () => {
    const { handler, toolExecutor, context } = setup();

    const node = { key: "transfer", type: WorkflowNodeType.HUMAN_TRANSFER, config: {} };
    await handler.execute(node, context);

    const call = toolExecutor.execute.mock.calls[0][0];
    expect(typeof call.arguments.reason).toBe("string");
    expect((call.arguments.reason as string).length).toBeGreaterThan(0);
  });
});
