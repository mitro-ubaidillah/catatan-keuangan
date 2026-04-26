import crypto from "node:crypto";
import { prisma } from "./db.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

type IdempotencyInput = {
  platform: "telegram" | "whatsapp";
  externalMessageId?: string;
  externalChatId: string;
  externalUserId: string;
  messageText: string;
  messageTimestamp?: Date;
};

let lastCleanupAtMs = 0;

function buildDedupeKey(input: IdempotencyInput): string {
  if (input.externalMessageId?.trim()) {
    return `${input.platform}:${input.externalMessageId.trim()}`;
  }

  const ts = input.messageTimestamp?.getTime() ?? Date.now();
  const minuteBucket = Math.floor(ts / 60_000);
  const source = [
    input.platform,
    input.externalChatId,
    input.externalUserId,
    input.messageText.trim().toLowerCase(),
    String(minuteBucket)
  ].join("|");

  return `${input.platform}:fallback:${crypto.createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

async function cleanupOldProcessedMessages() {
  const now = Date.now();
  if (now - lastCleanupAtMs < 30 * 60_000) return;
  lastCleanupAtMs = now;

  try {
    const cutoff = new Date(now - config.IDP_MESSAGE_TTL_HOURS * 60 * 60_000);
    await prisma.processedMessage.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
  } catch (err) {
    logger.warn({ err }, "Failed to cleanup old processed messages");
  }
}

export async function markMessageIfNew(input: IdempotencyInput): Promise<boolean> {
  await cleanupOldProcessedMessages();
  const dedupeKey = buildDedupeKey(input);

  try {
    await prisma.processedMessage.create({
      data: {
        dedupeKey,
        platform: input.platform,
        externalMessageId: input.externalMessageId ?? null,
        externalChatId: input.externalChatId,
        externalUserId: input.externalUserId,
        messageText: input.messageText
      }
    });
    return true;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return false;
    throw err;
  }
}
