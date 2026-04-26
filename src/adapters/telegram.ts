import { Telegraf } from "telegraf";
import { config } from "../config.js";
import { setTelegramState } from "../services/health.js";
import { logger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";

type OnTextHandler = (payload: {
  platform: "telegram";
  chatId: string;
  userId: string;
  text: string;
  senderName?: string;
  messageId?: string;
  messageTimestamp?: Date;
}) => Promise<{
  text: string;
  skipSend?: boolean;
  document?: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    caption?: string;
  };
}>;

export function initTelegram(onText: OnTextHandler) {
  if (!config.TELEGRAM_BOT_TOKEN) {
    setTelegramState("missing_config");
    logger.warn("TELEGRAM_BOT_TOKEN is empty, Telegram adapter skipped");
    return;
  }

  setTelegramState("starting");
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.on("text", async (ctx) => {
    const reply = await onText({
      platform: "telegram",
      chatId: String(ctx.chat.id),
      userId: String(ctx.from?.id ?? "unknown"),
      text: ctx.message.text,
      senderName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || ctx.from?.username,
      messageId: String(ctx.message.message_id),
      messageTimestamp: ctx.message.date ? new Date(ctx.message.date * 1000) : new Date()
    });
    if (reply.skipSend) return;

    if (reply.document) {
      await retry(
        () => ctx.replyWithDocument(
          { source: reply.document!.buffer, filename: reply.document!.fileName },
          { caption: reply.document!.caption ?? reply.text }
        ),
        {
          attempts: config.BOT_SEND_RETRY_ATTEMPTS,
          baseDelayMs: config.BOT_SEND_RETRY_BASE_MS,
          maxDelayMs: config.BOT_SEND_RETRY_MAX_MS
        }
      );
      return;
    }

    await retry(
      () => ctx.reply(reply.text),
      {
        attempts: config.BOT_SEND_RETRY_ATTEMPTS,
        baseDelayMs: config.BOT_SEND_RETRY_BASE_MS,
        maxDelayMs: config.BOT_SEND_RETRY_MAX_MS
      }
    );
  });

  bot
    .launch()
    .then(() => {
      setTelegramState("connected");
      logger.info("Telegram bot started");
    })
    .catch((err) => {
      setTelegramState("error");
      logger.error({ err }, "Telegram failed to start");
    });
}
