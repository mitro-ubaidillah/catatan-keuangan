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
  SESSION_SECRET: z.string().min(16),
  SUPERADMIN_EMAIL: z.string().optional(),
  SUPERADMIN_PASSWORD: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  WA_ENABLED: z.string().default("true"),
  WA_SESSION_DIR: z.string().default(".wa_auth")
});

export const config = schema.parse(process.env);
