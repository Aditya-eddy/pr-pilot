import Redis from "ioredis";

import type { CacheStore } from "@/lib/cache/cache-store";

export class RedisCache implements CacheStore {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 2,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }
}
