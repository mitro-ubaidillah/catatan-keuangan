import crypto from "node:crypto";
import { config } from "../config.js";

type SessionPayload = {
  userId: string;
  role: string;
  exp: number;
};

const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days

function getSessionSecret(): string {
  return config.SESSION_SECRET;
}

function b64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(input: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(input).digest("base64url");
}

export function createSessionToken(userId: string, role: string): string {
  const payload: SessionPayload = {
    userId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  };
  const body = b64(JSON.stringify(payload));
  const signature = sign(body);
  return `${body}.${signature}`;
}

export function verifySessionToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  if (sign(body) !== signature) return null;

  try {
    const payload = JSON.parse(unb64(body)) as SessionPayload;
    if (!payload.userId || !payload.role || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

