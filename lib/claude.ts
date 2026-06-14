import "server-only";

import { getCache } from "@/lib/cache";
import { config } from "@/lib/config";
import { runCommand } from "@/lib/shell";
import type { ClaudeRateLimitWindow, ClaudeStatus } from "@/lib/types";

const CLAUDE_STATUS_CACHE_KEY = "claude:account-status:v1";

// Claude exposes no free, standalone usage endpoint (unlike `codex app-server`).
// The only source of live rate-limit window state is the `rate_limit_event`
// emitted on a real turn, so we run the cheapest possible probe (Haiku, all
// tools disabled, a one-token prompt) and cache the result aggressively.
const PROBE_MODEL = "haiku";

const WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour",
  seven_day: "Weekly",
  seven_day_opus: "Weekly (Opus)",
  seven_day_sonnet: "Weekly (Sonnet)",
};

interface RateLimitInfo {
  rateLimitType?: string;
  resetsAt?: number | null;
  status?: string;
}

declare global {
  var codexPilotClaudeStatusFetch: Promise<ClaudeStatus> | undefined;
}

async function fetchClaudeStatus(): Promise<ClaudeStatus> {
  const environment = { ...process.env };
  if (config.ANTHROPIC_API_KEY) {
    environment.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
  }

  const { stdout } = await runCommand(
    "claude",
    [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      PROBE_MODEL,
      // `--tools` is variadic, so the prompt must come from stdin — a trailing
      // positional prompt would be consumed as a tool name and leave none.
      "--tools",
      "",
    ],
    { env: environment, input: "ping", timeoutMs: 60_000 },
  );

  const windows: ClaudeRateLimitWindow[] = [];
  const seen = new Set<string>();

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: { rate_limit_info?: RateLimitInfo; type?: string };
    try {
      event = JSON.parse(trimmed) as typeof event;
    } catch {
      continue;
    }

    if (event.type !== "rate_limit_event" || !event.rate_limit_info) {
      continue;
    }

    const info = event.rate_limit_info;
    const type = info.rateLimitType ?? "unknown";
    if (seen.has(type)) continue;
    seen.add(type);

    windows.push({
      label: WINDOW_LABELS[type] ?? type,
      rateLimitType: type,
      resetsAt: info.resetsAt
        ? new Date(info.resetsAt * 1_000).toISOString()
        : null,
      status: info.status ?? "unknown",
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    model: PROBE_MODEL,
    windows,
  };
}

export async function getClaudeStatus(refresh = false): Promise<ClaudeStatus> {
  const cache = getCache();

  if (!refresh) {
    const cached = await cache.get<ClaudeStatus>(CLAUDE_STATUS_CACHE_KEY);
    if (cached) {
      return cached;
    }
  }

  if (!globalThis.codexPilotClaudeStatusFetch) {
    globalThis.codexPilotClaudeStatusFetch = fetchClaudeStatus().finally(() => {
      globalThis.codexPilotClaudeStatusFetch = undefined;
    });
  }

  const status = await globalThis.codexPilotClaudeStatusFetch;
  await cache.set(
    CLAUDE_STATUS_CACHE_KEY,
    status,
    config.CLAUDE_STATUS_CACHE_TTL_SECONDS,
  );
  return status;
}
