-- CreateEnum
CREATE TYPE "TelephonyProvider" AS ENUM ('TWILIO', 'EXOTEL', 'PLIVO', 'RETELL', 'VAPI');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'AZURE_OPENAI');

-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "businessName" TEXT,
    "businessEmail" TEXT,
    "businessPhone" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "address" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "language" TEXT NOT NULL DEFAULT 'en',
    "businessHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelephonyConfig" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "provider" "TelephonyProvider" NOT NULL,
    "authId" TEXT,
    "authToken" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "webhookSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "defaultModel" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "TelephonyConfig_workspaceId_idx" ON "TelephonyConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "TelephonyConfig_workspaceId_isActive_idx" ON "TelephonyConfig"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "AiProviderConfig_workspaceId_idx" ON "AiProviderConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "AiProviderConfig_workspaceId_isActive_idx" ON "AiProviderConfig"("workspaceId", "isActive");

-- AddForeignKey
ALTER TABLE "WorkspaceSettings" ADD CONSTRAINT "WorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelephonyConfig" ADD CONSTRAINT "TelephonyConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
