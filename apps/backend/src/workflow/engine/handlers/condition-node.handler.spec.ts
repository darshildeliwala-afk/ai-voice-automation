import { WorkflowNodeType } from "../../../generated/prisma/client";
import type { WorkflowExecutionContext } from "../workflow-node-handler.interface";
import { ConditionNodeHandler } from "./condition-node.handler";

function context(overrides: Partial<WorkflowExecutionContext> = {}): WorkflowExecutionContext {
  return {
    workspaceId: "workspace-1",
    customerId: "customer-1",
    conversationId: "conv-1",
    orderId: "order-1",
    provider: { chat: jest.fn() } as never,
    providerName: "OPENAI" as never,
    messages: [],
    state: {},
    ...overrides,
  };
}

describe("ConditionNodeHandler", () => {
  const handler = new ConditionNodeHandler();

  it("routes to whenTrue when the condition matches", async () => {
    const node = {
      key: "c",
      type: WorkflowNodeType.CONDITION,
      config: { field: "orderId", operator: "equals", value: "order-1", whenTrue: "a", whenFalse: "b" },
    };

    const result = await handler.execute(node, context());

    expect(result.next).toBe("a");
  });

  it("routes to whenFalse when the condition does not match", async () => {
    const node = {
      key: "c",
      type: WorkflowNodeType.CONDITION,
      config: { field: "orderId", operator: "equals", value: "different-order", whenTrue: "a", whenFalse: "b" },
    };

    const result = await handler.execute(node, context());

    expect(result.next).toBe("b");
  });

  it("evaluates against accumulated workflow state, not just context fields", async () => {
    const node = {
      key: "c",
      type: WorkflowNodeType.CONDITION,
      config: {
        field: "state.lookup_order.status",
        operator: "equals",
        value: "DELIVERED",
        whenTrue: "a",
        whenFalse: "b",
      },
    };

    const result = await handler.execute(
      node,
      context({ state: { lookup_order: { status: "DELIVERED" } } }),
    );

    expect(result.next).toBe("a");
  });

  it("is never terminal", async () => {
    const node = {
      key: "c",
      type: WorkflowNodeType.CONDITION,
      config: { field: "orderId", operator: "exists", whenTrue: "a", whenFalse: "b" },
    };

    const result = await handler.execute(node, context());

    expect(result.terminal).toBeUndefined();
  });
});
