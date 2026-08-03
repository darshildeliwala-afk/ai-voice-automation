-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "aiAgentId" UUID,
    "callId" UUID,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "conversationId" UUID,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_callId_key" ON "Conversation"("callId");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_idx" ON "Conversation"("workspaceId");

-- CreateIndex
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");

-- CreateIndex
CREATE INDEX "Conversation_orderId_idx" ON "Conversation"("orderId");

-- CreateIndex
CREATE INDEX "Conversation_aiAgentId_idx" ON "Conversation"("aiAgentId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_idx" ON "ConversationMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsage_workspaceId_idx" ON "AIUsage"("workspaceId");

-- CreateIndex
CREATE INDEX "AIUsage_conversationId_idx" ON "AIUsage"("conversationId");

-- CreateIndex
CREATE INDEX "AIUsage_workspaceId_createdAt_idx" ON "AIUsage"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
