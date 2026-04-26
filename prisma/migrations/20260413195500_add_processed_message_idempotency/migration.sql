-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "externalChatId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_dedupeKey_key" ON "ProcessedMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "ProcessedMessage_createdAt_idx" ON "ProcessedMessage"("createdAt");
