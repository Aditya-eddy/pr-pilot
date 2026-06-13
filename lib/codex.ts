import "server-only";

import { spawn } from "node:child_process";
import readline from "node:readline";

import { getCache } from "@/lib/cache";
import { config } from "@/lib/config";
import type {
  CodexModelOption,
  CodexStatus,
  CodexUsageWindow,
  ReasoningEffort,
} from "@/lib/types";

const CODEX_STATUS_CACHE_KEY = "codex:account-status:v1";

interface AppServerRateLimitWindow {
  resetsAt: number | null;
  usedPercent: number;
  windowDurationMins: number | null;
}

interface AppServerRateLimitSnapshot {
  credits: {
    balance: string | null;
    hasCredits: boolean;
    unlimited: boolean;
  } | null;
  planType: string | null;
  primary: AppServerRateLimitWindow | null;
  rateLimitReachedType: string | null;
  secondary: AppServerRateLimitWindow | null;
}

interface AppServerRateLimitsResponse {
  rateLimits: AppServerRateLimitSnapshot;
  rateLimitsByLimitId: Record<string, AppServerRateLimitSnapshot> | null;
}

interface AppServerModel {
  defaultReasoningEffort: ReasoningEffort;
  description: string;
  displayName: string;
  hidden: boolean;
  id: string;
  isDefault: boolean;
  model: string;
  supportedReasoningEfforts: Array<{
    description: string;
    reasoningEffort: ReasoningEffort;
  }>;
}

interface AppServerModelListResponse {
  data: AppServerModel[];
}

interface JsonRpcMessage {
  error?: { code: number; message: string };
  id?: number;
  result?: unknown;
}

declare global {
  var codexPilotStatusFetch: Promise<CodexStatus> | undefined;
}

function normalizeWindow(
  window: AppServerRateLimitWindow | null,
): CodexUsageWindow | null {
  if (!window) {
    return null;
  }

  return {
    remainingPercent: Math.max(0, Math.min(100, 100 - window.usedPercent)),
    resetsAt: window.resetsAt
      ? new Date(window.resetsAt * 1_000).toISOString()
      : null,
    usedPercent: window.usedPercent,
    windowDurationMinutes: window.windowDurationMins,
  };
}

function normalizeModels(models: AppServerModel[]): CodexModelOption[] {
  return models
    .filter((model) => !model.hidden)
    .map((model) => ({
      defaultReasoningEffort: model.defaultReasoningEffort,
      description: model.description,
      displayName: model.displayName,
      id: model.id,
      isDefault: model.isDefault,
      reasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({
        description: effort.description,
        value: effort.reasoningEffort,
      })),
    }));
}

function fetchCodexStatus(): Promise<CodexStatus> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = readline.createInterface({ input: child.stdout });
    let stderr = "";
    let rateLimits: AppServerRateLimitsResponse | undefined;
    let modelList: AppServerModelListResponse | undefined;
    let settled = false;

    const finish = (
      error?: Error,
      status?: CodexStatus,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      child.kill();

      if (error) {
        reject(error);
      } else if (status) {
        resolve(status);
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error("Timed out while reading Codex usage"));
    }, 15_000);

    const send = (message: unknown): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const maybeResolve = (): void => {
      if (!rateLimits || !modelList) return;

      const snapshot =
        rateLimits.rateLimitsByLimitId?.codex ?? rateLimits.rateLimits;
      finish(undefined, {
        credits: snapshot.credits,
        fetchedAt: new Date().toISOString(),
        models: normalizeModels(modelList.data),
        planType: snapshot.planType,
        primary: normalizeWindow(snapshot.primary),
        rateLimitReachedType: snapshot.rateLimitReachedType,
        secondary: normalizeWindow(snapshot.secondary),
      });
    };

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8_000);
    });

    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!settled) {
        finish(
          new Error(
            `Codex app-server exited with code ${code}: ${stderr.trim()}`,
          ),
        );
      }
    });

    lines.on("line", (line) => {
      let message: JsonRpcMessage;

      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        return;
      }

      if (message.error) {
        finish(
          new Error(
            `Codex app-server error ${message.error.code}: ${message.error.message}`,
          ),
        );
        return;
      }

      if (message.id === 0) {
        send({ method: "initialized", params: {} });
        send({
          id: 1,
          method: "account/rateLimits/read",
          params: null,
        });
        send({ id: 2, method: "model/list", params: {} });
      } else if (message.id === 1) {
        rateLimits = message.result as AppServerRateLimitsResponse;
        maybeResolve();
      } else if (message.id === 2) {
        modelList = message.result as AppServerModelListResponse;
        maybeResolve();
      }
    });

    send({
      id: 0,
      method: "initialize",
      params: {
        clientInfo: {
          name: "codex_pr_pilot",
          title: "Codex PR Pilot",
          version: "0.1.0",
        },
      },
    });
  });
}

export async function getCodexStatus(
  refresh = false,
): Promise<CodexStatus> {
  const cache = getCache();

  if (!refresh) {
    const cached = await cache.get<CodexStatus>(CODEX_STATUS_CACHE_KEY);
    if (cached) {
      return cached;
    }
  }

  if (!globalThis.codexPilotStatusFetch) {
    globalThis.codexPilotStatusFetch = fetchCodexStatus().finally(() => {
      globalThis.codexPilotStatusFetch = undefined;
    });
  }

  const status = await globalThis.codexPilotStatusFetch;
  await cache.set(
    CODEX_STATUS_CACHE_KEY,
    status,
    config.CODEX_STATUS_CACHE_TTL_SECONDS,
  );
  return status;
}
