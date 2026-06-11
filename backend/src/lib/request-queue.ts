type Mode = "deep_research" | "web_search" | "normal";

export class QueueFullError extends Error {
  readonly statusCode = 429;
  readonly code = "queue_full";
  constructor(mode: string, size: number) {
    super(`${mode} queue is full (${size} pending). Try again in a moment.`);
    this.name = "QueueFullError";
  }
}

class SimpleQueue {
  private active = 0;
  private readonly pending: Array<() => void> = [];
  constructor(private readonly concurrency: number, private readonly maxPending = 10) {}

  get size(): number {
    return this.pending.length;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    if (this.pending.length > this.maxPending) {
      throw new QueueFullError("default", this.pending.length);
    }
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.pending.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.pending.shift()?.();
    }
  }
}

const queues: Record<Mode, SimpleQueue> = {
  deep_research: new SimpleQueue(Number(process.env.MAX_DEEP_RESEARCH_CONCURRENCY ?? 3)),
  web_search: new SimpleQueue(Number(process.env.MAX_WEB_SEARCH_CONCURRENCY ?? 8)),
  normal: new SimpleQueue(20),
};

export async function enqueueRequest<T>(mode: Mode, fn: () => Promise<T>): Promise<T> {
  const queue = queues[mode] ?? queues.normal;
  if (queue.size > 10) {
    throw new QueueFullError(mode, queue.size);
  }
  return queue.add(fn);
}

export class DeepResearchSemaphore {
  private active = 0;
  private readonly maxConcurrent: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  get queueLength(): number {
    return this.queue.length;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

export const deepResearchSemaphore = new DeepResearchSemaphore(
  Number(process.env.MAX_DEEP_RESEARCH_CONCURRENCY ?? 2),
);
