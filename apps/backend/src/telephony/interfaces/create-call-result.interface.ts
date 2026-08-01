import type { CallStatus } from "../../generated/prisma/client";

export interface CreateCallResult {
  callId: string;
  status: CallStatus;
}
