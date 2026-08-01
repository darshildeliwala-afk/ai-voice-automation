/**
 * Fixed-length placeholder for secrets in API responses. Deliberately NOT
 * proportional to the real secret's length -- length itself is information
 * that shouldn't leak.
 */
export const MASKED_SECRET_VALUE = "**************";

/** Returns the masking placeholder for a stored secret, or null if unset. */
export function maskSecret(value: string | null | undefined): string | null {
  return value ? MASKED_SECRET_VALUE : null;
}
