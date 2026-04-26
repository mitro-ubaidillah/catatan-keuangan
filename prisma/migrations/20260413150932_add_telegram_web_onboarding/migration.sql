-- CreateTable
CREATE TABLE "OnboardingToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnboardingToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingToken_token_key" ON "OnboardingToken"("token");

-- CreateIndex
CREATE INDEX "OnboardingToken_userId_expiresAt_idx" ON "OnboardingToken"("userId", "expiresAt");
