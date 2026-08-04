-- CreateEnum
CREATE TYPE "SttProvider" AS ENUM ('DEEPGRAM', 'WHISPER');

-- CreateEnum
CREATE TYPE "TtsProvider" AS ENUM ('ELEVENLABS', 'OPENAI', 'CARTESIA');

-- CreateTable
CREATE TABLE "SttProviderConfig" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "provider" "SttProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SttProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsProviderConfig" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "provider" "TtsProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "voice" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TtsProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SttProviderConfig_workspaceId_idx" ON "SttProviderConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "SttProviderConfig_workspaceId_isActive_idx" ON "SttProviderConfig"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "TtsProviderConfig_workspaceId_idx" ON "TtsProviderConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "TtsProviderConfig_workspaceId_isActive_idx" ON "TtsProviderConfig"("workspaceId", "isActive");

-- AddForeignKey
ALTER TABLE "SttProviderConfig" ADD CONSTRAINT "SttProviderConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtsProviderConfig" ADD CONSTRAINT "TtsProviderConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
