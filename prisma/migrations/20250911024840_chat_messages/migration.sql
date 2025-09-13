-- CreateEnum
CREATE TYPE "public"."ChatSender" AS ENUM ('me', 'seller');

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "userId" TEXT,
    "from" "public"."ChatSender" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_sellerId_createdAt_idx" ON "public"."ChatMessage"("sellerId", "createdAt");
