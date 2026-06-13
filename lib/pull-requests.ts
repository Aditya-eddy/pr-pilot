import "server-only";

import { getCache } from "@/lib/cache";
import { config } from "@/lib/config";
import {
  fetchOpenPullRequests,
  OPEN_PULL_REQUESTS_CACHE_KEY,
} from "@/lib/github";
import type { PullRequestList } from "@/lib/types";

type CachedPullRequestList = Omit<PullRequestList, "cached">;

declare global {
  var codexPilotPullRequestFetch:
    | Promise<CachedPullRequestList>
    | undefined;
}

export async function listOpenPullRequests(
  refresh = false,
): Promise<PullRequestList> {
  const cache = getCache();

  if (!refresh) {
    const cached = await cache.get<CachedPullRequestList>(
      OPEN_PULL_REQUESTS_CACHE_KEY,
    );

    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const fresh =
    globalThis.codexPilotPullRequestFetch ??
    fetchOpenPullRequests().finally(() => {
      globalThis.codexPilotPullRequestFetch = undefined;
    });
  globalThis.codexPilotPullRequestFetch = fresh;

  const result = await fresh;
  await cache.set(
    OPEN_PULL_REQUESTS_CACHE_KEY,
    result,
    config.PR_CACHE_TTL_SECONDS,
  );

  return { ...result, cached: false };
}
