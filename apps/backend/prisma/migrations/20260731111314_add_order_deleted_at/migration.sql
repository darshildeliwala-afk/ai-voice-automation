-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_workspaceId_deletedAt_idx" ON "Order"("workspaceId", "deletedAt");
