import type { NormalizedCallStatus } from "../../interfaces/call-status.types";

/**
 * Maps Plivo's raw call-state vocabulary to our normalized CallStatus.
 * Plivo uses different field names/values across contexts: webhook
 * `CallStatus` params (ringing, in-progress, completed, busy, failed,
 * no-answer, timeout, canceled) and the REST `Call.get()` `callState`
 * field (RINGING, IN_PROGRESS, COMPLETED, ..., upper snake-ish). This is
 * the single place either shape gets normalized -- do not duplicate this
 * mapping in a caller.
 */
export function mapPlivoStatus(rawStatus: string): NormalizedCallStatus {
  const normalized = rawStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");

  switch (normalized) {
    case "queued":
    case "initiated":
    case "created":
      return "INITIATED";
    case "ringing":
      return "RINGING";
    case "in-progress":
    case "answered":
    case "live":
      return "CONNECTED";
    case "completed":
      return "COMPLETED";
    case "busy":
      return "BUSY";
    case "no-answer":
    case "timeout":
      return "NO_ANSWER";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "failed":
      return "FAILED";
    default:
      return "FAILED";
  }
}
