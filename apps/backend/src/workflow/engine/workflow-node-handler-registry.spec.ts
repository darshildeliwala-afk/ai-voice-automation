import { WorkflowNodeType } from "../../generated/prisma/client";
import { WorkflowNodeHandlerRegistry } from "./workflow-node-handler-registry";

function fakeHandler(type: WorkflowNodeType) {
  return { type: () => type, execute: jest.fn() };
}

describe("WorkflowNodeHandlerRegistry", () => {
  it("looks up a handler by node type", () => {
    const promptHandler = fakeHandler(WorkflowNodeType.PROMPT);
    const endHandler = fakeHandler(WorkflowNodeType.END);
    const registry = new WorkflowNodeHandlerRegistry([promptHandler, endHandler] as never);

    expect(registry.getHandler(WorkflowNodeType.PROMPT)).toBe(promptHandler);
    expect(registry.getHandler(WorkflowNodeType.END)).toBe(endHandler);
  });

  it("returns undefined for an unregistered type", () => {
    const registry = new WorkflowNodeHandlerRegistry([] as never);

    expect(registry.getHandler(WorkflowNodeType.CONDITION)).toBeUndefined();
  });
});
