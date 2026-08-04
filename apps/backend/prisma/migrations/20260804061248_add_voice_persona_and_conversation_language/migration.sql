-- CreateEnum
CREATE TYPE "VoicePersonaTone" AS ENUM ('FRIENDLY', 'PROFESSIONAL', 'SUPPORT', 'SALES', 'EMPATHETIC', 'HEALTHCARE', 'BANKING', 'COLLECTIONS');

-- CreateEnum
CREATE TYPE "VoiceGender" AS ENUM ('MALE', 'FEMALE', 'NEUTRAL');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "language" TEXT;

-- CreateTable
CREATE TABLE "VoicePersonaConfig" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "tone" "VoicePersonaTone" NOT NULL DEFAULT 'FRIENDLY',
    "language" TEXT NOT NULL DEFAULT 'hi-en',
    "voiceGender" "VoiceGender",
    "voiceName" TEXT,
    "indianAccent" BOOLEAN NOT NULL DEFAULT true,
    "speakingRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "pitch" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "warmth" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "professionalism" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "pauseShortMs" INTEGER NOT NULL DEFAULT 300,
    "pauseMediumMs" INTEGER NOT NULL DEFAULT 500,
    "pauseLongMs" INTEGER NOT NULL DEFAULT 700,
    "fillerWordsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bargeInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxResponseLength" INTEGER NOT NULL DEFAULT 60,
    "silenceThresholdMs" INTEGER NOT NULL DEFAULT 2000,
    "greetingStyle" TEXT,
    "closingStyle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoicePersonaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentVoicePersonaOverride" (
    "id" UUID NOT NULL,
    "aiAgentId" UUID NOT NULL,
    "tone" "VoicePersonaTone",
    "language" TEXT,
    "voiceGender" "VoiceGender",
    "voiceName" TEXT,
    "indianAccent" BOOLEAN,
    "speakingRate" DOUBLE PRECISION,
    "pitch" DOUBLE PRECISION,
    "warmth" DOUBLE PRECISION,
    "professionalism" DOUBLE PRECISION,
    "pauseShortMs" INTEGER,
    "pauseMediumMs" INTEGER,
    "pauseLongMs" INTEGER,
    "fillerWordsEnabled" BOOLEAN,
    "bargeInEnabled" BOOLEAN,
    "maxResponseLength" INTEGER,
    "silenceThresholdMs" INTEGER,
    "greetingStyle" TEXT,
    "closingStyle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentVoicePersonaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoicePersonaConfig_workspaceId_key" ON "VoicePersonaConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentVoicePersonaOverride_aiAgentId_key" ON "AiAgentVoicePersonaOverride"("aiAgentId");

-- AddForeignKey
ALTER TABLE "VoicePersonaConfig" ADD CONSTRAINT "VoicePersonaConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentVoicePersonaOverride" ADD CONSTRAINT "AiAgentVoicePersonaOverride_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
