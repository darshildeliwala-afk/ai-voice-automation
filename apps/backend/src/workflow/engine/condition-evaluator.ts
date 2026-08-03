import type { ConditionOperator } from "../workflow.types";

function resolvePath(subject: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, subject);
}

function isComparable(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Evaluates a single CONDITION node's rule against the workflow's
 * evaluation subject (execution context fields + accumulated state, see
 * WorkflowExecutionEngine). Pure and unit-testable in isolation from the
 * rest of the engine.
 */
export function evaluateCondition(
  subject: Record<string, unknown>,
  field: string,
  operator: ConditionOperator,
  value?: unknown,
): boolean {
  const actual = resolvePath(subject, field);

  switch (operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "notExists":
      return actual === undefined || actual === null;
    case "equals":
      return actual === value;
    case "notEquals":
      return actual !== value;
    case "contains":
      if (typeof actual === "string" && typeof value === "string") {
        return actual.includes(value);
      }
      if (Array.isArray(actual)) {
        return actual.includes(value);
      }
      return false;
    case "greaterThan":
      return isComparable(actual) && isComparable(value) && actual > value;
    case "lessThan":
      return isComparable(actual) && isComparable(value) && actual < value;
    default:
      return false;
  }
}
