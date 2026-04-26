import dayjs from "dayjs";
import { initTelegram } from "./adapters/telegram.js";
import { initWhatsApp } from "./adapters/whatsapp.js";
import { handleCommand } from "./core/commandHandler.js";
import { getHealthMessage } from "./services/health.js";
import { findUserByExternalId, upsertUserByExternalId } from "./services/userRegistry.js";
import { buildUserExportWorkbook, createAsset, createTransaction, getStats, getUserSummary } from "./services/financeStore.js";
import { markMessageIfNew } from "./services/idempotency.js";
import { enqueueHeavyJob } from "./services/jobQueue.js";
import { checkHeavyCommandRateLimit } from "./services/rateLimit.js";
import { startWebServer } from "./web/server.js";
import { config } from "./config.js";
import { createOnboardingTokenForUser, hasActiveSubscription } from "./web/service.js";
import { logger } from "./utils/logger.js";

type IncomingPayload = {
  platform: "telegram" | "whatsapp";
  chatId: string;
  userId: string;
  text: string;
  senderName?: string;
  messageId?: string;
  messageTimestamp?: Date;
};

export type BotReply = {
  text: string;
  skipSend?: boolean;
  document?: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    caption?: string;
  };
};

function formatIdr(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function reply(text: string): BotReply {
  return { text };
}

async function onIncomingText(payload: IncomingPayload): Promise<BotReply> {
  try {
    const { platform, chatId, userId, text, senderName } = payload;
    logger.info({ platform, chatId, userId, text }, "Incoming message");

    const isNewMessage = await markMessageIfNew({
      platform,
      externalMessageId: payload.messageId,
      externalChatId: chatId,
      externalUserId: userId,
      messageText: text,
      messageTimestamp: payload.messageTimestamp
    });
    if (!isNewMessage) {
      logger.info({ platform, chatId, userId, messageId: payload.messageId }, "Duplicate incoming message ignored");
      return { text: "", skipSend: true };
    }

    const cmd = handleCommand(text);
    const user = await findUserByExternalId(platform, userId);

    if (cmd.kind === "register") {
      const displayName = cmd.payload?.displayName ?? senderName ?? `user-${userId.slice(-6)}`;
      const registeredUser = user ?? await upsertUserByExternalId({ platform, externalUserId: userId, displayName });
      const onboardingToken = await createOnboardingTokenForUser(registeredUser.id);
      const onboardingUrl = `${config.WEB_BASE_URL.replace(/\/$/, "")}/onboarding/${onboardingToken.token}`;

      if (registeredUser.email && registeredUser.passwordHash) {
        return reply([
          `Kamu sudah terdaftar sebagai ${registeredUser.displayName}.`,
          "Kalau ingin update password/email, minta admin reset onboarding."
        ].join("\n"));
      }

      return reply([
        `Registrasi berhasil untuk ${registeredUser.displayName}.`,
        "Penyimpanan sekarang menggunakan database.",
        "Langkah berikutnya: konfirmasi akun web dan set password lewat link ini:",
        onboardingUrl,
        "Format command:",
        "/pengeluaran beli bakso 10000",
        "/pemasukan bonus tahunan 3000000",
        "/menabung emas antam sejumlah 10 gram"
      ].join("\n"));
    }

    if (cmd.kind === "transaction" && cmd.payload) {
      if (!user) {
        return reply([
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n"));
      }
      if (!hasActiveSubscription(user)) {
        return reply("Subscription kamu tidak aktif/expired. Hubungi admin untuk perpanjangan.");
      }

      await createTransaction(user.id, cmd.payload);
      return reply(`Tersimpan: ${cmd.payload.type} ${cmd.payload.description} Rp${cmd.payload.amount.toLocaleString("id-ID")}`);
    }

    if (cmd.kind === "asset" && cmd.payload) {
      if (!user) {
        return reply([
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n"));
      }
      if (!hasActiveSubscription(user)) {
        return reply("Subscription kamu tidak aktif/expired. Hubungi admin untuk perpanjangan.");
      }

      await createAsset(user.id, cmd.payload);
      return reply(`Tabungan aset tersimpan: ${cmd.payload.name} ${cmd.payload.quantity} ${cmd.payload.unit}`);
    }

    if (cmd.kind === "stat" && cmd.payload) {
      if (!user) {
        return reply([
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n"));
      }
      if (!hasActiveSubscription(user)) {
        return reply("Subscription kamu tidak aktif/expired. Hubungi admin untuk perpanjangan.");
      }
      const limit = checkHeavyCommandRateLimit({ userId: user.id, command: "stat" });
      if (!limit.allowed) {
        return reply(`Terlalu sering meminta statistik. Coba lagi dalam ${limit.retryAfterSec ?? 1} detik.`);
      }

      const result = await enqueueHeavyJob(() => getStats(user.id, cmd.payload));
      const periodLabel = cmd.payload.year && cmd.payload.month
        ? `${cmd.payload.year}-${String(cmd.payload.month).padStart(2, "0")}`
        : cmd.payload.year
          ? String(cmd.payload.year)
          : "Semua";
      const top = result.topCategories.length
        ? result.topCategories.map(([cat, amount]) => `- ${cat}: ${formatIdr(amount)}`).join("\n")
        : "-";

      return reply([
        `Statistik (${periodLabel})`,
        `Total transaksi: ${result.totalTx}`,
        `Pemasukan: ${formatIdr(result.income)}`,
        `Pengeluaran: ${formatIdr(result.expense)}`,
        `Saldo: ${formatIdr(result.balance)}`,
        `Nilai aset: ${formatIdr(result.assetValue)}`,
        "Top kategori pengeluaran:",
        top
      ].join("\n"));
    }

    if (cmd.kind === "export") {
      if (!user) {
        return reply([
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n"));
      }
      if (!hasActiveSubscription(user)) {
        return reply("Subscription kamu tidak aktif/expired. Hubungi admin untuk perpanjangan.");
      }
      const limit = checkHeavyCommandRateLimit({ userId: user.id, command: "export" });
      if (!limit.allowed) {
        return reply(`Terlalu sering meminta export. Coba lagi dalam ${limit.retryAfterSec ?? 1} detik.`);
      }

      const exported = await enqueueHeavyJob(() => buildUserExportWorkbook(user.id, user.displayName));
      return {
        text: `Export selesai. Transaksi: ${exported.transactionCount}, Aset: ${exported.assetCount}.`,
        document: {
          fileName: exported.fileName,
          mimeType: exported.mimeType,
          buffer: exported.buffer,
          caption: "Berikut file export keuangan kamu."
        }
      };
    }

    if (cmd.kind === "sheet") {
      return reply("Mode spreadsheet dimatikan. Data sekarang disimpan di database.");
    }

    if (cmd.kind === "profile") {
      if (!user) {
        return reply([
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n"));
      }

      const summary = await getUserSummary(user.id);
      const isSubActive = hasActiveSubscription(user);

      return reply([
        "Profil User",
        `Nama: ${user.displayName}`,
        `Role: ${user.role}`,
        `Status akun: ${user.isActive ? "active" : "inactive"}`,
        `Subscription: ${user.subscriptionPlan} (${user.subscriptionStatus})`,
        `Subscription aktif: ${isSubActive ? "ya" : "tidak"}`,
        `Subscription berakhir: ${user.subscriptionEndsAt ? dayjs(user.subscriptionEndsAt).format("DD MMM YYYY") : "no expiry"}`,
        `Total transaksi: ${summary.txCount}`,
        `Total aset: ${summary.assetCount}`,
        `Aktivitas transaksi terakhir: ${summary.lastTx ? `${summary.lastTx.type} ${formatIdr(summary.lastTx.amount)} - ${summary.lastTx.description} (${dayjs(summary.lastTx.createdAt).format("DD MMM YYYY HH:mm")})` : "-"}`,
        `Aktivitas aset terakhir: ${summary.lastAsset ? `${summary.lastAsset.name} ${summary.lastAsset.quantity} ${summary.lastAsset.unit} (${dayjs(summary.lastAsset.createdAt).format("DD MMM YYYY HH:mm")})` : "-"}`
      ].join("\n"));
    }

    if (cmd.kind === "health") {
      return reply(getHealthMessage());
    }

    return reply([
      "Perintah belum dikenali.",
      "Contoh:",
      "/daftar Mitro",
      "/pengeluaran beli bakso 10000",
      "/pemasukan bonus tahunan 3000000",
      "/menabung emas antam sejumlah 10 gram",
      "/statistik 2026-04",
      "/export",
      "/profil",
      "/health"
    ].join("\n"));
  } catch (err) {
    logger.error({ err }, "Failed to process incoming message");
    const message = err instanceof Error ? err.message : String(err);
    if (message === "USER_SOFT_DELETED") {
      return reply("Akun kamu sudah dihapus oleh superadmin. Hubungi admin untuk restore akun.");
    }

    return reply(`Terjadi error saat memproses command: ${message}`);
  }
}

async function bootstrap() {
  logger.info("Starting bot-catat-keuangan...");

  if (config.WEB_ENABLED === "true") {
    await startWebServer();
  }

  initTelegram(onIncomingText);
  await initWhatsApp(onIncomingText);
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
