import type { IAITool } from "./ai-tool.interface";
import { AIToolRegistry } from "./ai-tool-registry";

function fakeTool(name: string): IAITool {
  return {
    name: () => name,
    description: () => `Description for ${name}`,
    parameters: () => ({ type: "object", properties: {}, required: [] }),
    execute: jest.fn(),
  };
}

describe("AIToolRegistry", () => {
  it("looks up a registered tool by name", () => {
    const toolA = fakeTool("tool_a");
    const toolB = fakeTool("tool_b");
    const registry = new AIToolRegistry([toolA, toolB]);

    expect(registry.getTool("tool_a")).toBe(toolA);
    expect(registry.getTool("tool_b")).toBe(toolB);
  });

  it("returns undefined for an unregistered tool name", () => {
    const registry = new AIToolRegistry([fakeTool("tool_a")]);

    expect(registry.getTool("unknown_tool")).toBeUndefined();
  });

  it("getAll() returns every registered tool", () => {
    const tools = [fakeTool("tool_a"), fakeTool("tool_b"), fakeTool("tool_c")];
    const registry = new AIToolRegistry(tools);

    expect(registry.getAll()).toHaveLength(3);
  });

  it("getToolDefinitions() maps each tool to its provider-agnostic definition", () => {
    const registry = new AIToolRegistry([fakeTool("tool_a")]);

    expect(registry.getToolDefinitions()).toEqual([
      {
        name: "tool_a",
        description: "Description for tool_a",
        parameters: { type: "object", properties: {}, required: [] },
      },
    ]);
  });

  it("works correctly with zero registered tools", () => {
    const registry = new AIToolRegistry([]);

    expect(registry.getAll()).toEqual([]);
    expect(registry.getToolDefinitions()).toEqual([]);
    expect(registry.getTool("anything")).toBeUndefined();
  });
});
