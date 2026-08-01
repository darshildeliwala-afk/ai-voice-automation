/*
  Warnings:

  - Added the required column `orderId` to the `Call` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phoneNumber` to the `Call` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `Call` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `Call` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CallStatus" ADD VALUE 'INITIATED';
ALTER TYPE "CallStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "CallStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "answeredAt" TIMESTAMP(3),
ADD COLUMN     "direction" "CallDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN     "hangupReason" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "orderId" UUID NOT NULL,
ADD COLUMN     "phoneNumber" TEXT NOT NULL,
ADD COLUMN     "provider" "TelephonyProvider" NOT NULL,
ADD COLUMN     "providerPayload" JSONB,
ADD COLUMN     "workspaceId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "TelephonyWebhookEvent" (
    "id" UUID NOT NULL,
    "provider" "TelephonyProvider" NOT NULL,
    "providerCallId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelephonyWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelephonyWebhookEvent_providerCallId_idx" ON "TelephonyWebhookEvent"("providerCallId");

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyWebhookEvent_provider_providerCallId_eventType_key" ON "TelephonyWebhookEvent"("provider", "providerCallId", "eventType");

-- CreateIndex
CREATE INDEX "Call_workspaceId_idx" ON "Call"("workspaceId");

-- CreateIndex
CREATE INDEX "Call_orderId_idx" ON "Call"("orderId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
