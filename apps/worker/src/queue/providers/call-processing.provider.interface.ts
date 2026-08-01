import type { CallQueue } from "../../generated/prisma/client";

export const CALL_PROCESSING_PROVIDER = Symbol("CALL_PROCESSING_PROVIDER");

export interface CallProcessingResult {
  success: boolean;
  message?: string;
}

/**
 * Abstraction over "do the actual work for this queued call". No concrete
 * telephony or AI implementation exists yet (Sprint 12.1 scope) -- see
 * StubCallProcessingProvider. A future Plivo/AI-backed implementation can
 * be swapped in behind this interface without touching the processor.
 */
export interface ICallProcessingProvider {
  process(job: CallQueue): Promise<CallProcessingResult>;
}
