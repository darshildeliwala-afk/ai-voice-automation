import type { QueueStatus } from "../../generated/prisma/client";

export interface EnqueueCallResult {
  queueId: string;
  status: QueueStatus;
}
