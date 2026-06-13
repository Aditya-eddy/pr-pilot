import type { CacheStore } from "@/lib/cache/cache-store";

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>();

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1_000,
      value,
    });
  }
}
