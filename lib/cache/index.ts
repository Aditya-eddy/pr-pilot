import "server-only";

import type { CacheStore } from "@/lib/cache/cache-store";
import { MemoryCache } from "@/lib/cache/memory-cache";
import { RedisCache } from "@/lib/cache/redis-cache";
import { config } from "@/lib/config";

declare global {
  var codexPilotCache: CacheStore | undefined;
}

export function getCache(): CacheStore {
  if (!globalThis.codexPilotCache) {
    globalThis.codexPilotCache = config.REDIS_URL
      ? new RedisCache(config.REDIS_URL)
      : new MemoryCache();
  }

  return globalThis.codexPilotCache;
}
