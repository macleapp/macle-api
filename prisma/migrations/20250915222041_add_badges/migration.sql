/*
  Warnings:

  - Added the required column `updatedAt` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ServiceProfile` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."BadgeCode" AS ENUM ('real_photo', 'real_name', 'kindness', 'on_time', 'top_recommended');

-- CreateEnum
CREATE TYPE "public"."BadgeIcon" AS ENUM ('user_check', 'id_card', 'smile', 'clock', 'award');

-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "categoryPercentile" DOUBLE PRECISION,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hasRealPhoto" BOOLEAN DEFAULT false,
ADD COLUMN     "onTimeRate" DOUBLE PRECISION,
ADD COLUMN     "ratingAvg" DOUBLE PRECISION,
ADD COLUMN     "realNameVerified" BOOLEAN DEFAULT false,
ADD COLUMN     "responseRate" DOUBLE PRECISION,
ADD COLUMN     "responseTimeMs" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."ServiceProfile" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "public"."Badge" (
    "id" SERIAL NOT NULL,
    "code" "public"."BadgeCode" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" "public"."BadgeIcon" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SellerBadge" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "badgeId" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "public"."Badge"("code");

-- CreateIndex
CREATE INDEX "SellerBadge_ownerId_idx" ON "public"."SellerBadge"("ownerId");

-- CreateIndex
CREATE INDEX "SellerBadge_badgeId_idx" ON "public"."SellerBadge"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerBadge_ownerId_badgeId_key" ON "public"."SellerBadge"("ownerId", "badgeId");

-- AddForeignKey
ALTER TABLE "public"."SellerBadge" ADD CONSTRAINT "SellerBadge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SellerBadge" ADD CONSTRAINT "SellerBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "public"."Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
