-- AlterTable
ALTER TABLE "CallQueue" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "workerId" TEXT;

-- CreateIndex
CREATE INDEX "CallQueue_lockedAt_idx" ON "CallQueue"("lockedAt");
