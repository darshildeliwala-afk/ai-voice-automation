import type { CallQueue } from "../../generated/prisma/client";

export const CALL_QUEUE_REPOSITORY = Symbol("CALL_QUEUE_REPOSITORY");

export interface ICallQueueRepository {
  /** Rows eligible to be handed to the queue (QUEUED and due). */
  findDue(limit: number, now: Date): Promise<CallQueue[]>;

  /**
   * Atomically claims a row: only succeeds if the row is still QUEUED.
   * Returns null if another worker (or a previous attempt) already claimed it.
   */
  claim(id: string, workerId: string): Promise<CallQueue | null>;

  complete(id: string): Promise<void>;

  /** Releases the lock and returns the row to QUEUED for another attempt. */
  requeue(id: string, error: string): Promise<void>;

  /** Terminal failure — attempts exhausted. */
  fail(id: string, error: string): Promise<void>;

  findById(id: string): Promise<CallQueue | null>;

  /** Resets CALLING rows whose lock is older than `staleBefore` back to QUEUED. */
  recoverStaleLocks(staleBefore: Date): Promise<number>;

  getStatusCounts(): Promise<Record<string, number>>;
}
