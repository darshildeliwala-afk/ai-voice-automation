export const CALL_QUEUE_NAME = "call-queue";
export const CALL_QUEUE_JOB_NAME = "process-call-queue-row";

/** Business-level cap on attempts; the row is marked FAILED past this. */
export const QUEUE_MAX_ATTEMPTS = Number(process.env.QUEUE_MAX_ATTEMPTS ?? 3);

/**
 * BullMQ's own attempts ceiling. Kept a little above QUEUE_MAX_ATTEMPTS so
 * BullMQ never gives up on a job before our business logic has had the
 * chance to decide requeue-vs-fail itself.
 */
export const BULLMQ_JOB_ATTEMPTS = QUEUE_MAX_ATTEMPTS + 2;
export const BULLMQ_BACKOFF_BASE_DELAY_MS = 5000;

export const QUEUE_POLL_INTERVAL_MS = Number(
  process.env.QUEUE_POLL_INTERVAL_MS ?? 2000,
);
export const QUEUE_LOCK_TTL_MS = Number(
  process.env.QUEUE_LOCK_TTL_MS ?? 60000,
);
export const QUEUE_POLL_BATCH_SIZE = 50;
