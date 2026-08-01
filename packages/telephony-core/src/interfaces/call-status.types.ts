/**
 * Provider-agnostic call lifecycle vocabulary. By convention these string
 * values are kept identical to the CallStatus enum values in both apps'
 * Prisma schemas, so callers can assign a NormalizedCallStatus straight
 * into a Prisma `status` field without a second translation layer -- the
 * one and only status mapping (raw provider status -> this vocabulary)
 * lives in providers/plivo/plivo-status.mapper.ts.
 */
export type NormalizedCallStatus =
  | "INITIATED"
  | "RINGING"
  | "CONNECTED"
  | "COMPLETED"
  | "FAILED"
  | "NO_ANSWER"
  | "BUSY"
  | "CANCELLED"
  | "VOICEMAIL";

export type NormalizedCallDirection = "OUTBOUND" | "INBOUND";
