import { config } from "../config.js";

type BucketState = {
  points: number[];
  updatedAt: number;
};

const buckets = new Map<string, BucketState>();

function keyOf(userId: string, command: string): string {
  return `${userId}:${command}`;
}

function cleanup(now: number) {
  const staleMs = Math.max(config.HEAVY_CMD_RATE_LIMIT_WINDOW_SEC * 1000 * 4, 300_000);
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.updatedAt > staleMs) buckets.delete(key);
  }
}

export function checkHeavyCommandRateLimit(params: {
  userId: string;
  command: "stat" | "export";
}): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const windowMs = config.HEAVY_CMD_RATE_LIMIT_WINDOW_SEC * 1000;
  const max = config.HEAVY_CMD_RATE_LIMIT_MAX;
  const key = keyOf(params.userId, params.command);
  const bucket = buckets.get(key) ?? { points: [], updatedAt: now };
  bucket.points = bucket.points.filter((ts) => now - ts < windowMs);

  if (bucket.points.length >= max) {
    const earliest = bucket.points[0];
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - earliest)) / 1000));
    buckets.set(key, { ...bucket, updatedAt: now });
    cleanup(now);
    return { allowed: false, retryAfterSec };
  }

  bucket.points.push(now);
  bucket.updatedAt = now;
  buckets.set(key, bucket);
  cleanup(now);
  return { allowed: true };
}
