import { WorkflowNodeType } from "../../generated/prisma/client";
import type { WorkflowGraph } from "../workflow.types";
import type { WorkflowExecutionContext } from "./workflow-node-handler.interface";
import { WorkflowExecutionEngine } from "./workflow-execution.engine";

function context(): WorkflowExecutionContext {
  return {
    workspaceId: "workspace-1",
    customerId: "customer-1",
    conversationId: "conv-1",
    provider: { chat: jest.fn() } as never,
    providerName: "OPENAI" as never,
    messages: [],
    state: {},
  };
}

function registryWith(handlers: Record<string, { execute: jest.Mock }>) {
  return {
    getHandler: (type: WorkflowNodeType) => handlers[type],
  } as never;
}

describe("WorkflowExecutionEngine", () => {
  it("walks a simple linear graph to its terminal node", async () => {
    const promptExecute = jest.fn().mockResolvedValue({
      next: "end",
      content: "Hi!",
      usage: [{ model: "gpt-4o-mini", promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 }],
    });
    const endExecute = jest.fn().mockResolvedValue({ terminal: true, toolCallsExecuted: ["end_call"] });

    const engine = new WorkflowExecutionEngine(
      registryWith({
        [WorkflowNodeType.PROMPT]: { execute: promptExecute },
        [WorkflowNodeType.END]: { execute: endExecute },
      }),
    );

    const graph: WorkflowGraph = {
      entryNodeKey: "start",
      nodes: [
        { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "end" } },
        { key: "end", type: WorkflowNodeType.END, config: {} },
      ],
    };

    const result = await engine.execute(graph, context());

    expect(promptExecute).toHaveBeenCalledTimes(1);
    expect(endExecute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      content: "Hi!",
      toolCallsExecuted: ["end_call"],
      model: "gpt-4o-mini",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      stepsExecuted: 2,
    });
  });

  it("stops when a node returns no `next` (terminal by absence)", async () => {
    const promptExecute = jest.fn().mockResolvedValue({ content: "Done", usage: [] });

    const engine = new WorkflowExecutionEngine(
      registryWith({ [WorkflowNodeType.PROMPT]: { execute: promptExecute } }),
    );

    const graph: WorkflowGraph = {
      entryNodeKey: "start",
      nodes: [{ key: "start", type: WorkflowNodeType.PROMPT, config: {} }],
    };

    const result = await engine.execute(graph, context());

    expect(promptExecute).toHaveBeenCalledTimes(1);
    expect(result.stepsExecuted).toBe(1);
    expect(result.content).toBe("Done");
  });

  it("merges stateUpdates into the shared context.state between nodes", async () => {
    const toolExecute = jest.fn().mockResolvedValue({
      next: "condition",
      stateUpdates: { lookup: { status: "SHIPPED" } },
    });
    const conditionExecute = jest.fn().mockImplementation((_node, ctx: WorkflowExecutionContext) => {
      expect(ctx.state).toEqual({ lookup: { status: "SHIPPED" } });
      return Promise.resolve({ next: "end" });
    });
    const endExecute = jest.fn().mockResolvedValue({ terminal: true });

    const engine = new WorkflowExecutionEngine(
      registryWith({
        [WorkflowNodeType.TOOL]: { execute: toolExecute },
        [WorkflowNodeType.CONDITION]: { execute: conditionExecute },
        [WorkflowNodeType.END]: { execute: endExecute },
      }),
    );

    const graph: WorkflowGraph = {
      entryNodeKey: "lookup",
      nodes: [
        { key: "lookup", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order", next: "condition" } },
        { key: "condition", type: WorkflowNodeType.CONDITION, config: {} },
        { key: "end", type: WorkflowNodeType.END, config: {} },
      ],
    };

    await engine.execute(graph, context());

    expect(conditionExecute).toHaveBeenCalledTimes(1);
    expect(endExecute).toHaveBeenCalledTimes(1);
  });

  it("aggregates usage and toolCallsExecuted across multiple nodes", async () => {
    const promptExecute = jest.fn().mockResolvedValue({
      next: "tool",
      usage: [{ model: "gpt-4o-mini", promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 }],
    });
    const toolExecute = jest.fn().mockResolvedValue({
      next: "end",
      toolCallsExecuted: ["lookup_order"],
    });
    const endExecute = jest.fn().mockResolvedValue({ terminal: true, toolCallsExecuted: ["end_call"] });

    const engine = new WorkflowExecutionEngine(
      registryWith({
        [WorkflowNodeType.PROMPT]: { execute: promptExecute },
        [WorkflowNodeType.TOOL]: { execute: toolExecute },
        [WorkflowNodeType.END]: { execute: endExecute },
      }),
    );

    const graph: WorkflowGraph = {
      entryNodeKey: "start",
      nodes: [
        { key: "start", type: WorkflowNodeType.PROMPT, config: { next: "tool" } },
        { key: "tool", type: WorkflowNodeType.TOOL, config: { toolName: "lookup_order", next: "end" } },
        { key: "end", type: WorkflowNodeType.END, config: {} },
      ],
    };

    const result = await engine.execute(graph, context());

    expect(result.toolCallsExecuted).toEqual(["lookup_order", "end_call"]);
    expect(result.totalTokens).toBe(15);
  });

  it("stops at MAX_WORKFLOW_STEPS (25) to guard against a misconfigured cycle", async () => {
    const promptExecute = jest.fn().mockResolvedValue({ next: "loop-b" });
    const otherExecute = jest.fn().mockResolvedValue({ next: "loop-a" });

    const engine = new WorkflowExecutionEngine(
      registryWith({
        [WorkflowNodeType.PROMPT]: { execute: promptExecute },
        [WorkflowNodeType.TOOL]: { execute: otherExecute },
      }),
    );

    const graph: WorkflowGraph = {
      entryNodeKey: "loop-a",
      nodes: [
        { key: "loop-a", type: WorkflowNodeType.PROMPT, config: { next: "loop-b" } },
        { key: "loop-b", type: WorkflowNodeType.TOOL, config: { toolName: "x", next: "loop-a" } },
      ],
    };

    const result = await engine.execute(graph, context());

    expect(result.stepsExecuted).toBe(25);
  });

  it("throws when `next` references a node not present in the graph", async () => {
    const promptExecute = jest.fn().mockResolvedValue({ next: "nonexistent" });

    const engine = new WorkflowExecutionEngine(
      registryWith({ [WorkflowNodeType.PROMPT]: { execute: promptExecute } }),
    );

    const graph: WorkflowGraph = {
      entryNodeKey: "start",
      nodes: [{ key: "start", type: WorkflowNodeType.PROMPT, config: { next: "nonexistent" } }],
    };

    await expect(engine.execute(graph, context())).rejects.toThrow(
      'Workflow node "nonexistent" not found',
    );
  });
});
