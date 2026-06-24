-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExtractionType" AS ENUM ('audio', 'video');

-- CreateEnum
CREATE TYPE "ExtractionJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "type" "ExtractionType" NOT NULL,
    "quality" TEXT NOT NULL,
    "status" "ExtractionJobStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "assetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedAsset" (
    "id" UUID NOT NULL,
    "videoId" TEXT NOT NULL,
    "type" "ExtractionType" NOT NULL,
    "quality" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractionJob_status_createdAt_idx" ON "ExtractionJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_assetId_idx" ON "ExtractionJob"("assetId");

-- CreateIndex
CREATE INDEX "ExtractedAsset_expiresAt_idx" ON "ExtractedAsset"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedAsset_videoId_type_quality_key" ON "ExtractedAsset"("videoId", "type", "quality");

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ExtractedAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
