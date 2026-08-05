-- CreateEnum
CREATE TYPE "AiAgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LiveCallSpeakingParty" AS ENUM ('AI', 'CUSTOMER', 'SILENCE');

-- CreateEnum
CREATE TYPE "LiveCallAiStatus" AS ENUM ('LISTENING', 'THINKING', 'SPEAKING', 'IDLE');

-- CreateEnum
CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "AiAgent" ADD COLUMN     "businessGoal" TEXT,
ADD COLUMN     "maxTokens" INTEGER,
ADD COLUMN     "status" "AiAgentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "KnowledgeBase" ADD COLUMN     "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'READY';

-- CreateTable
CREATE TABLE "LiveCallState" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "conversationId" UUID,
    "currentWorkflowNodeKey" TEXT,
    "speakingParty" "LiveCallSpeakingParty" NOT NULL DEFAULT 'SILENCE',
    "aiStatus" "LiveCallAiStatus" NOT NULL DEFAULT 'LISTENING',
    "lastTranscriptSnippet" TEXT,
    "turnStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveCallState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveCallState_callId_key" ON "LiveCallState"("callId");

-- CreateIndex
CREATE INDEX "LiveCallState_workspaceId_idx" ON "LiveCallState"("workspaceId");

-- AddForeignKey
ALTER TABLE "LiveCallState" ADD CONSTRAINT "LiveCallState_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
