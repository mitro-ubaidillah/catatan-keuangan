import { config } from "../config.js";

type ConnState = "disabled" | "missing_config" | "starting" | "connected" | "disconnected" | "error";

const runtime = {
  startedAt: new Date(),
  telegram: "starting" as ConnState,
  whatsapp: "starting" as ConnState
};

export function setTelegramState(state: ConnState) {
  runtime.telegram = state;
}

export function setWhatsAppState(state: ConnState) {
  runtime.whatsapp = state;
}

function asOk(v: boolean): string {
  return v ? "OK" : "BELUM";
}

export function getHealthMessage(): string {
  const uptimeSec = Math.floor(process.uptime());

  return [
    "Health Check",
    `uptime_sec: ${uptimeSec}`,
    `telegram: ${runtime.telegram}`,
    `whatsapp: ${runtime.whatsapp}`,
    "storage_mode: db",
    `db_url: ${asOk(Boolean(config.DATABASE_URL))}`,
    `started_at: ${runtime.startedAt.toISOString()}`
  ].join("\n");
}
