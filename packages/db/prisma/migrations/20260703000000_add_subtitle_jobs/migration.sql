-- CreateEnum
CREATE TYPE "SubtitleJobStatus" AS ENUM ('queued', 'extracting_audio', 'transcribing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "SubtitleJob" (
    "id" UUID NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "sourceObjectKey" TEXT NOT NULL,
    "sourceContentType" TEXT NOT NULL,
    "sourceSizeBytes" INTEGER NOT NULL,
    "resultObjectKey" TEXT,
    "status" "SubtitleJobStatus" NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubtitleJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubtitleJob_status_createdAt_idx" ON "SubtitleJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SubtitleJob_expiresAt_idx" ON "SubtitleJob"("expiresAt");
