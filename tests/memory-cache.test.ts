import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryCache } from "@/lib/cache/memory-cache";

describe("MemoryCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns values before their TTL expires", async () => {
    vi.useFakeTimers();
    const cache = new MemoryCache();

    await cache.set("key", { value: 42 }, 10);

    expect(await cache.get("key")).toEqual({ value: 42 });
    vi.advanceTimersByTime(9_999);
    expect(await cache.get("key")).toEqual({ value: 42 });
  });

  it("evicts expired values", async () => {
    vi.useFakeTimers();
    const cache = new MemoryCache();

    await cache.set("key", "value", 1);
    vi.advanceTimersByTime(1_000);

    expect(await cache.get("key")).toBeNull();
  });

  it("deletes values explicitly", async () => {
    const cache = new MemoryCache();

    await cache.set("key", "value", 60);
    await cache.delete("key");

    expect(await cache.get("key")).toBeNull();
  });
});
