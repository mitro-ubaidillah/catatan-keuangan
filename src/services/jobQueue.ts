import { config } from "../config.js";

type Job = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

class AsyncJobQueue {
  private queue: Job[] = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = Math.max(1, concurrency);
  }

  enqueue<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: () => run(),
        resolve: (value) => resolve(value as T),
        reject
      });
      this.kick();
    });
  }

  private kick() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) return;
      this.running += 1;

      item.run()
        .then((value) => item.resolve(value))
        .catch((err) => item.reject(err))
        .finally(() => {
          this.running -= 1;
          this.kick();
        });
    }
  }
}

const heavyJobQueue = new AsyncJobQueue(config.HEAVY_JOB_CONCURRENCY);

export function enqueueHeavyJob<T>(run: () => Promise<T>): Promise<T> {
  return heavyJobQueue.enqueue(run);
}
