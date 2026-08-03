import { resolveTemplatedArguments } from "./template-resolver";

describe("resolveTemplatedArguments", () => {
  it("substitutes a whole-string token with the resolved value, preserving type", () => {
    const resolved = resolveTemplatedArguments(
      { orderId: "{{orderId}}" },
      { orderId: "order-123" },
    );
    expect(resolved).toEqual({ orderId: "order-123" });
  });

  it("resolves dot-paths into nested state", () => {
    const resolved = resolveTemplatedArguments(
      { status: "{{state.lookup_order.status}}" },
      { state: { lookup_order: { status: "DELIVERED" } } },
    );
    expect(resolved).toEqual({ status: "DELIVERED" });
  });

  it("preserves non-string values unchanged", () => {
    const resolved = resolveTemplatedArguments(
      { count: 3, active: true, meta: { a: 1 } },
      {},
    );
    expect(resolved).toEqual({ count: 3, active: true, meta: { a: 1 } });
  });

  it("leaves literal strings that aren't a single token unchanged", () => {
    const resolved = resolveTemplatedArguments(
      { note: "hello {{orderId}} world", reason: "plain text" },
      { orderId: "order-123" },
    );
    expect(resolved).toEqual({
      note: "hello {{orderId}} world",
      reason: "plain text",
    });
  });

  it("leaves an unresolved token as the literal string", () => {
    const resolved = resolveTemplatedArguments({ orderId: "{{nonexistent}}" }, {});
    expect(resolved).toEqual({ orderId: "{{nonexistent}}" });
  });

  it("returns an empty object when args is undefined", () => {
    expect(resolveTemplatedArguments(undefined, { orderId: "x" })).toEqual({});
  });
});
