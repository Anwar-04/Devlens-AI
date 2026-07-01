import { Redis } from "ioredis";

export interface QueueOptions {
  maxRetriesPerRequest?: number | null;
  retryDelayMs?: number;
}

export class RedisQueue<T> {
  private redis: Redis;
  private queueKey: string;
  private retryDelayMs: number;

  constructor(queueName: string, redisUrl: string, options: QueueOptions = {}) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: options.maxRetriesPerRequest ?? null,
      lazyConnect: true
    });
    this.queueKey = `queue:${queueName}`;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  async connect(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }

  async enqueue(payload: T): Promise<void> {
    await this.connect();
    await this.redis.lpush(this.queueKey, JSON.stringify(payload));
  }

  async dequeue(worker: (payload: T) => Promise<void>): Promise<void> {
    await this.connect();
    while (true) {
      try {
        const result = await this.redis.brpop(this.queueKey, 0);
        if (result?.[1]) {
          const payload: T = JSON.parse(result[1]);
          await worker(payload);
        }
      } catch (error) {
        console.error(`[QueueError] Failed to process job on queue ${this.queueKey}:`, error);
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  async size(): Promise<number> {
    await this.connect();
    return this.redis.llen(this.queueKey);
  }

  async close(): Promise<void> {
    if (this.redis.status !== "end") {
      await this.redis.quit();
    }
  }
}