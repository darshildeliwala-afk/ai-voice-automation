const FULL_TOKEN_PATTERN = /^\{\{\s*([\w.]+)\s*\}\}$/;

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

/**
 * Resolves `{{path}}` placeholders in a TOOL node's configured arguments
 * against the workflow's evaluation subject (execution context fields +
 * accumulated state). Only whole-string tokens are substituted (e.g.
 * `"{{orderId}}"` -> the actual orderId, preserving its type) -- partial
 * interpolation inside a larger string is intentionally not supported, since
 * workflow arguments are whole values (an id, a date), not free text.
 * Non-string values and unresolved tokens pass through unchanged.
 */
export function resolveTemplatedArguments(
  args: Record<string, unknown> | undefined,
  subject: Record<string, unknown>,
): Record<string, unknown> {
  if (!args) {
    return {};
  }

  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      const match = FULL_TOKEN_PATTERN.exec(value);
      if (match) {
        const path = match[1];
        const substituted = resolvePath(subject, path);
        resolved[key] = substituted === undefined ? value : substituted;
        continue;
      }
    }

    resolved[key] = value;
  }

  return resolved;
}
