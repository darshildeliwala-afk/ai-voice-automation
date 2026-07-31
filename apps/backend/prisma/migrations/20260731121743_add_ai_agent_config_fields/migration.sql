/*
  Warnings:

  - Added the required column `language` to the `AiAgent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `model` to the `AiAgent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `AiAgent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `voice` to the `AiAgent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AiAgent" ADD COLUMN     "greeting" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "language" TEXT NOT NULL,
ADD COLUMN     "model" TEXT NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "systemPrompt" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
ADD COLUMN     "voice" TEXT NOT NULL;
