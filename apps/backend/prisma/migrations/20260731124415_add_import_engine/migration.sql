/*
  Warnings:

  - Added the required column `fileName` to the `ImportJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileType` to the `ImportJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `headers` to the `ImportJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `suggestedMapping` to the `ImportJob` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'IMPORTED', 'FAILED');

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "errorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fieldMapping" JSONB,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileType" TEXT NOT NULL,
ADD COLUMN     "headers" JSONB NOT NULL,
ADD COLUMN     "invalidRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN     "successCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suggestedMapping" JSONB NOT NULL,
ADD COLUMN     "totalRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validRows" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "mappedData" JSONB,
    "groupKey" TEXT,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "customerId" UUID,
    "orderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRow_importJobId_idx" ON "ImportRow"("importJobId");

-- CreateIndex
CREATE INDEX "ImportRow_importJobId_status_idx" ON "ImportRow"("importJobId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_importJobId_groupKey_idx" ON "ImportRow"("importJobId", "groupKey");

-- CreateIndex
CREATE INDEX "ImportJob_workspaceId_idx" ON "ImportJob"("workspaceId");

-- CreateIndex
CREATE INDEX "ImportJob_workspaceId_status_idx" ON "ImportJob"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
