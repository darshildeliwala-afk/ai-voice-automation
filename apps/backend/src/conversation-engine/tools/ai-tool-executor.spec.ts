import { AIToolExecutor } from "./ai-tool-executor";
import type { IAITool } from "./ai-tool.interface";

const CONTEXT = {
  workspaceId: "workspace-1",
  customerId: "customer-1",
  conversationId: "conv-1",
};

function setup(tools: IAITool[]) {
  const registry = { getTool: jest.fn((name: string) => tools.find((t) => t.name() === name)) };
  const executor = new AIToolExecutor(registry as never);
  return { executor, registry };
}

function fakeTool(
  name: string,
  execute: IAITool["execute"],
): IAITool {
  return {
    name: () => name,
    description: () => "",
    parameters: () => ({ type: "object", properties: {}, required: [] }),
    execute,
  };
}

describe("AIToolExecutor", () => {
  it("executes the matching tool and returns its result", async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ content: '{"ok":true}' });
    const { executor } = setup([fakeTool("my_tool", execute)]);

    const result = await executor.execute(
      { id: "call_1", name: "my_tool", arguments: { foo: "bar" } },
      CONTEXT,
    );

    expect(result).toEqual({ content: '{"ok":true}' });
    expect(execute).toHaveBeenCalledWith({ foo: "bar" }, CONTEXT);
  });

  it("returns a graceful error result for an unknown tool name (never throws)", async () => {
    const { executor } = setup([]);

    const result = await executor.execute(
      { id: "call_1", name: "nonexistent_tool", arguments: {} },
      CONTEXT,
    );

    expect(result.content).toContain("Unknown tool");
    expect(result.terminal).toBeFalsy();
  });

  it("returns a graceful error result when the tool itself throws (never propagates)", async () => {
    const execute = jest.fn().mockRejectedValue(new Error("db exploded"));
    const { executor } = setup([fakeTool("my_tool", execute)]);

    const result = await executor.execute(
      { id: "call_1", name: "my_tool", arguments: {} },
      CONTEXT,
    );

    expect(result.content).toContain("db exploded");
    expect(result.terminal).toBeFalsy();
  });

  it("passes through a terminal:true result from the tool unchanged", async () => {
    const execute = jest
      .fn()
      .mockResolvedValue({ content: "ended", terminal: true });
    const { executor } = setup([fakeTool("end_call", execute)]);

    const result = await executor.execute(
      { id: "call_1", name: "end_call", arguments: {} },
      CONTEXT,
    );

    expect(result.terminal).toBe(true);
  });
});
