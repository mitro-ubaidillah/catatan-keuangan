type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = Math.max(1, options.attempts);
  const factor = options.factor ?? 2;
  let delayMs = Math.max(1, options.baseDelayMs);
  let lastErr: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      await sleep(Math.min(delayMs, options.maxDelayMs));
      delayMs = Math.min(Math.ceil(delayMs * factor), options.maxDelayMs);
    }
  }

  throw lastErr;
}
