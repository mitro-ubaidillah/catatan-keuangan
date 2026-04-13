import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "node:fs";
import { config } from "../config.js";
import { setWhatsAppState } from "../services/health.js";
import { logger } from "../utils/logger.js";

type OnTextHandler = (payload: {
  platform: "whatsapp";
  chatId: string;
  userId: string;
  text: string;
  senderName?: string;
}) => Promise<string>;

export async function initWhatsApp(onText: OnTextHandler) {
  if (config.WA_ENABLED !== "true") {
    setWhatsAppState("disabled");
    logger.info("WA_ENABLED is false, WhatsApp adapter skipped");
    return;
  }

  setWhatsAppState("starting");

  if (!fs.existsSync(config.WA_SESSION_DIR)) {
    fs.mkdirSync(config.WA_SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.WA_SESSION_DIR);
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    const chatId = msg.key.remoteJid ?? "unknown";
    const userId = msg.key.participant ?? msg.key.remoteJid ?? "unknown";
    const reply = await onText({
      platform: "whatsapp",
      chatId,
      userId,
      text,
      senderName: msg.pushName ?? "unknown"
    });

    await sock.sendMessage(chatId, { text: reply });
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      setWhatsAppState("disconnected");
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        logger.warn("WhatsApp disconnected. Reconnecting...");
        void initWhatsApp(onText);
      }
    }

    if (connection === "open") {
      setWhatsAppState("connected");
      logger.info("WhatsApp connected");
    }
  });
}
