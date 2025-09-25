-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "lang" TEXT NOT NULL DEFAULT 'es',
ADD COLUMN     "legalAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "tcAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tcVersion" TEXT;
