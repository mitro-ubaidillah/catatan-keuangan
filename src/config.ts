import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  TIMEZONE: z.string().default("Asia/Jakarta"),
  DATABASE_URL: z.string().min(1),
  WEB_ENABLED: z.string().default("true"),
  WEB_PORT: z.coerce.number().default(3000),
  WEB_BASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(16),
  ONBOARDING_TOKEN_TTL_HOURS: z.coerce.number().default(24),
  SUBSCRIPTION_TRIAL_DAYS: z.coerce.number().default(30),
  IDP_MESSAGE_TTL_HOURS: z.coerce.number().default(72),
  HEAVY_CMD_RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(60),
  HEAVY_CMD_RATE_LIMIT_MAX: z.coerce.number().default(5),
  HEAVY_JOB_CONCURRENCY: z.coerce.number().default(1),
  BOT_SEND_RETRY_ATTEMPTS: z.coerce.number().default(3),
  BOT_SEND_RETRY_BASE_MS: z.coerce.number().default(350),
  BOT_SEND_RETRY_MAX_MS: z.coerce.number().default(2500),
  SUPERADMIN_EMAIL: z.string().optional(),
  SUPERADMIN_PASSWORD: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  WA_ENABLED: z.string().default("true"),
  WA_SESSION_DIR: z.string().default(".wa_auth")
});

const rawConfig = schema.parse(process.env);

function resolveWebBaseUrl(input: string | undefined, port: number): string {
  let value = (input ?? "").trim();
  value = value.replace(/^[`'"]|[`'"]$/g, "");

  if (!value) value = `http://localhost:${port}`;

  value = value
    .replaceAll("${WEB_PORT}", String(port))
    .replaceAll("$WEB_PORT", String(port))
    .replaceAll("{{WEB_PORT}}", String(port));

  return value.replace(/\/+$/g, "");
}

export const config = {
  ...rawConfig,
  WEB_BASE_URL: resolveWebBaseUrl(rawConfig.WEB_BASE_URL, rawConfig.WEB_PORT)
};
