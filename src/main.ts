import { initTelegram } from "./adapters/telegram.js";
import { initWhatsApp } from "./adapters/whatsapp.js";
import { handleCommand } from "./core/commandHandler.js";
import { getHealthMessage } from "./services/health.js";
import { findUserByExternalId, upsertUserByExternalId } from "./services/userRegistry.js";
import { createAsset, createTransaction, getStats } from "./services/financeStore.js";
import { startWebServer } from "./web/server.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

type IncomingPayload = {
  platform: "telegram" | "whatsapp";
  chatId: string;
  userId: string;
  text: string;
  senderName?: string;
};

function formatIdr(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

async function onIncomingText(payload: IncomingPayload): Promise<string> {
  try {
    const { platform, chatId, userId, text, senderName } = payload;
    logger.info({ platform, chatId, userId, text }, "Incoming message");

    const cmd = handleCommand(text);
    const user = await findUserByExternalId(platform, userId);

    if (cmd.kind === "register") {
      if (user) {
        return [
          `Kamu sudah terdaftar sebagai ${user.displayName}.`,
          "Sekarang pencatatan disimpan langsung ke database."
        ].join("\n");
      }

      const displayName = cmd.payload?.displayName ?? senderName ?? `user-${userId.slice(-6)}`;
      await upsertUserByExternalId({ platform, externalUserId: userId, displayName });

      return [
        `Registrasi berhasil untuk ${displayName}.`,
        "Penyimpanan sekarang menggunakan database.",
        "Format command:",
        "/pengeluaran beli bakso 10000",
        "/pemasukan bonus tahunan 3000000",
        "/menabung emas antam sejumlah 10 gram"
      ].join("\n");
    }

    if (cmd.kind === "transaction" && cmd.payload) {
      if (!user) {
        return [
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n");
      }

      await createTransaction(user.id, cmd.payload);
      return `Tersimpan: ${cmd.payload.type} ${cmd.payload.description} Rp${cmd.payload.amount.toLocaleString("id-ID")}`;
    }

    if (cmd.kind === "asset" && cmd.payload) {
      if (!user) {
        return [
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n");
      }

      await createAsset(user.id, cmd.payload);
      return `Tabungan aset tersimpan: ${cmd.payload.name} ${cmd.payload.quantity} ${cmd.payload.unit}`;
    }

    if (cmd.kind === "stat" && cmd.payload) {
      if (!user) {
        return [
          "Kamu belum terdaftar.",
          "Ketik `/daftar Nama Kamu` untuk registrasi."
        ].join("\n");
      }

      const result = await getStats(user.id, cmd.payload);
      const periodLabel = cmd.payload.year && cmd.payload.month
        ? `${cmd.payload.year}-${String(cmd.payload.month).padStart(2, "0")}`
        : cmd.payload.year
          ? String(cmd.payload.year)
          : "Semua";
      const top = result.topCategories.length
        ? result.topCategories.map(([cat, amount]) => `- ${cat}: ${formatIdr(amount)}`).join("\n")
        : "-";

      return [
        `Statistik (${periodLabel})`,
        `Total transaksi: ${result.totalTx}`,
        `Pemasukan: ${formatIdr(result.income)}`,
        `Pengeluaran: ${formatIdr(result.expense)}`,
        `Saldo: ${formatIdr(result.balance)}`,
        `Nilai aset: ${formatIdr(result.assetValue)}`,
        "Top kategori pengeluaran:",
        top
      ].join("\n");
    }

    if (cmd.kind === "sheet") {
      return "Mode spreadsheet dimatikan. Data sekarang disimpan di database.";
    }

    if (cmd.kind === "health") {
      return getHealthMessage();
    }

    return [
      "Perintah belum dikenali.",
      "Contoh:",
      "/daftar Mitro",
      "/pengeluaran beli bakso 10000",
      "/pemasukan bonus tahunan 3000000",
      "/menabung emas antam sejumlah 10 gram",
      "/statistik 2026-04",
      "/health"
    ].join("\n");
  } catch (err) {
    logger.error({ err }, "Failed to process incoming message");
    const message = err instanceof Error ? err.message : String(err);

    return `Terjadi error saat memproses command: ${message}`;
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
