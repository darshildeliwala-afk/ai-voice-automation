import { WorkflowNodeType } from "../../generated/prisma/client";
import type { WorkflowGraphNode } from "../workflow.types";
import { WorkflowValidatorService } from "./workflow-validator.service";

describe("WorkflowValidatorService", () => {
  const validator = new WorkflowValidatorService();

  function node(
    key: string,
    type: WorkflowNodeType,
    config: Record<string, unknown> = {},
  ): WorkflowGraphNode {
    return { key, type, config };
  }

  it("accepts a minimal valid graph: PROMPT -> END", () => {
    const nodes = [
      node("start", WorkflowNodeType.PROMPT, { next: "end" }),
      node("end", WorkflowNodeType.END, {}),
    ];

    const result = validator.validate(nodes, "start");

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("accepts a PROMPT node with no `next` as terminal on its own", () => {
    const nodes = [node("start", WorkflowNodeType.PROMPT, {})];

    const result = validator.validate(nodes, "start");

    expect(result.valid).toBe(true);
  });

  it("rejects an empty node list", () => {
    const result = validator.validate([], "start");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow must have at least one node");
  });

  it("rejects a missing entryNodeKey", () => {
    const nodes = [node("start", WorkflowNodeType.END, {})];
    const result = validator.validate(nodes, undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow must have an entryNodeKey");
  });

  it("rejects an entryNodeKey that doesn't reference a node", () => {
    const nodes = [node("start", WorkflowNodeType.END, {})];
    const result = validator.validate(nodes, "nonexistent");
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.includes("entryNodeKey")),
    ).toBe(true);
  });

  it("rejects duplicate node keys", () => {
    const nodes = [
      node("start", WorkflowNodeType.END, {}),
      node("start", WorkflowNodeType.END, {}),
    ];
    const result = validator.validate(nodes, "start");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("Duplicate node key"))).toBe(true);
  });

  it("rejects a dangling `next` reference", () => {
    const nodes = [node("start", WorkflowNodeType.PROMPT, { next: "missing" })];
    const result = validator.validate(nodes, "start");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('next "missing"'))).toBe(true);
  });

  it("rejects a TOOL node missing toolName", () => {
    const nodes = [node("t", WorkflowNodeType.TOOL, {})];
    const result = validator.validate(nodes, "t");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("toolName is required"))).toBe(true);
  });

  it("rejects a TOOL node referencing an unknown tool when knownToolNames is given", () => {
    const nodes = [node("t", WorkflowNodeType.TOOL, { toolName: "nonexistent_tool" })];
    const result = validator.validate(nodes, "t", ["lookup_order", "lookup_customer"]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('unknown tool "nonexistent_tool"'))).toBe(true);
  });

  it("accepts a TOOL node referencing a known tool", () => {
    const nodes = [
      node("t", WorkflowNodeType.TOOL, { toolName: "lookup_order", next: "e" }),
      node("e", WorkflowNodeType.END, {}),
    ];
    const result = validator.validate(nodes, "t", ["lookup_order"]);
    expect(result.valid).toBe(true);
  });

  it("rejects a CONDITION node missing field/operator/whenTrue/whenFalse", () => {
    const nodes = [node("c", WorkflowNodeType.CONDITION, {})];
    const result = validator.validate(nodes, "c");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("field is required"),
        expect.stringContaining("operator must be one of"),
        expect.stringContaining("whenTrue is required"),
        expect.stringContaining("whenFalse is required"),
      ]),
    );
  });

  it("rejects a CONDITION node with an invalid operator", () => {
    const nodes = [
      node("c", WorkflowNodeType.CONDITION, {
        field: "status",
        operator: "startsWith",
        whenTrue: "a",
        whenFalse: "b",
      }),
      node("a", WorkflowNodeType.END, {}),
      node("b", WorkflowNodeType.END, {}),
    ];
    const result = validator.validate(nodes, "c");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("operator must be one of"))).toBe(true);
  });

  it("accepts a valid CONDITION node branching to two terminals", () => {
    const nodes = [
      node("c", WorkflowNodeType.CONDITION, {
        field: "status",
        operator: "equals",
        value: "SHIPPED",
        whenTrue: "a",
        whenFalse: "b",
      }),
      node("a", WorkflowNodeType.END, {}),
      node("b", WorkflowNodeType.HUMAN_TRANSFER, {}),
    ];
    const result = validator.validate(nodes, "c");
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects an unreachable node", () => {
    const nodes = [
      node("start", WorkflowNodeType.END, {}),
      node("orphan", WorkflowNodeType.END, {}),
    ];
    const result = validator.validate(nodes, "start");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('"orphan" is unreachable'))).toBe(true);
  });

  it("rejects a graph with no reachable terminal (infinite loop)", () => {
    const nodes = [
      node("a", WorkflowNodeType.PROMPT, { next: "b" }),
      node("b", WorkflowNodeType.PROMPT, { next: "a" }),
    ];
    const result = validator.validate(nodes, "a");
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("no reachable terminal node"))).toBe(true);
  });

  it("accepts a CALLBACK node followed by an END node", () => {
    const nodes = [
      node("cb", WorkflowNodeType.CALLBACK, { scheduledInMinutes: 60, next: "end" }),
      node("end", WorkflowNodeType.END, {}),
    ];
    const result = validator.validate(nodes, "cb");
    expect(result).toEqual({ valid: true, errors: [] });
  });
});
