import { evaluateCondition } from "./condition-evaluator";

describe("evaluateCondition", () => {
  it("equals: true when the resolved field matches the value", () => {
    expect(evaluateCondition({ status: "SHIPPED" }, "status", "equals", "SHIPPED")).toBe(true);
    expect(evaluateCondition({ status: "PENDING" }, "status", "equals", "SHIPPED")).toBe(false);
  });

  it("notEquals: inverse of equals", () => {
    expect(evaluateCondition({ status: "PENDING" }, "status", "notEquals", "SHIPPED")).toBe(true);
    expect(evaluateCondition({ status: "SHIPPED" }, "status", "notEquals", "SHIPPED")).toBe(false);
  });

  it("exists / notExists", () => {
    expect(evaluateCondition({ a: 1 }, "a", "exists")).toBe(true);
    expect(evaluateCondition({}, "a", "exists")).toBe(false);
    expect(evaluateCondition({ a: null }, "a", "exists")).toBe(false);
    expect(evaluateCondition({}, "a", "notExists")).toBe(true);
    expect(evaluateCondition({ a: 1 }, "a", "notExists")).toBe(false);
  });

  it("contains: substring match for strings, membership for arrays", () => {
    expect(evaluateCondition({ msg: "hello world" }, "msg", "contains", "world")).toBe(true);
    expect(evaluateCondition({ msg: "hello world" }, "msg", "contains", "xyz")).toBe(false);
    expect(evaluateCondition({ tags: ["a", "b"] }, "tags", "contains", "b")).toBe(true);
    expect(evaluateCondition({ tags: ["a", "b"] }, "tags", "contains", "c")).toBe(false);
    expect(evaluateCondition({ n: 5 }, "n", "contains", "5")).toBe(false);
  });

  it("greaterThan / lessThan: numeric comparisons only", () => {
    expect(evaluateCondition({ total: 500 }, "total", "greaterThan", 100)).toBe(true);
    expect(evaluateCondition({ total: 50 }, "total", "greaterThan", 100)).toBe(false);
    expect(evaluateCondition({ total: 50 }, "total", "lessThan", 100)).toBe(true);
    expect(evaluateCondition({ total: "not-a-number" }, "total", "greaterThan", 100)).toBe(false);
    expect(evaluateCondition({ total: 500 }, "total", "greaterThan", "not-a-number")).toBe(false);
  });

  it("resolves dot-paths into nested objects", () => {
    const subject = { state: { lookup_order: { status: "DELIVERED" } } };
    expect(evaluateCondition(subject, "state.lookup_order.status", "equals", "DELIVERED")).toBe(true);
  });

  it("resolving through a missing intermediate path yields undefined, not a throw", () => {
    expect(evaluateCondition({}, "state.lookup_order.status", "equals", "DELIVERED")).toBe(false);
    expect(evaluateCondition({}, "state.lookup_order.status", "notExists")).toBe(true);
  });
});
