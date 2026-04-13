import { Telegraf } from "telegraf";
import { config } from "../config.js";
import { setTelegramState } from "../services/health.js";
import { logger } from "../utils/logger.js";

type OnTextHandler = (payload: {
  platform: "telegram";
  chatId: string;
  userId: string;
  text: string;
  senderName?: string;
}) => Promise<string>;

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
      senderName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || ctx.from?.username
    });
    await ctx.reply(reply);
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
