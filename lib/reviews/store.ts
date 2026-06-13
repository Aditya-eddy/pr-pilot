import "server-only";

import { randomUUID } from "node:crypto";

import { config } from "@/lib/config";
import { getCache } from "@/lib/cache";
import type {
  PullRequest,
  ReviewHistoryEntry,
  ReviewJob,
  ReviewJobEvent,
  ReviewJobEventLevel,
  ReviewJobEventSource,
  ReviewJobSnapshot,
} from "@/lib/types";

const HISTORY_LIMIT = 5;
const EVENT_LIMIT = 500;

function jobKey(jobId: string): string {
  return `review-job:${jobId}`;
}

function historyKey(pullRequest: PullRequest): string {
  return `review-history:${pullRequest.repository}#${pullRequest.number}`;
}

function eventsKey(jobId: string): string {
  return `review-job-events:${jobId}`;
}

function activeJobKey(pullRequest: PullRequest): string {
  return `review-active:${pullRequest.repository}#${pullRequest.number}`;
}

function isActive(job: ReviewJob): boolean {
  return ["queued", "preparing", "reviewing", "posting"].includes(job.status);
}

export class ReviewStore {
  private readonly cache = getCache();

  async create(job: ReviewJob): Promise<void> {
    await Promise.all([
      this.cache.set(jobKey(job.id), job, config.REVIEW_JOB_TTL_SECONDS),
      this.cache.set(eventsKey(job.id), [], config.REVIEW_JOB_TTL_SECONDS),
      this.cache.set(
        activeJobKey(job.pullRequest),
        job.id,
        Math.ceil(config.REVIEW_TIMEOUT_MS / 1_000) + 600,
      ),
    ]);
  }

  async get(jobId: string): Promise<ReviewJob | null> {
    return this.cache.get<ReviewJob>(jobKey(jobId));
  }

  async update(
    jobId: string,
    patch: Partial<Omit<ReviewJob, "id" | "pullRequest" | "createdAt">>,
  ): Promise<ReviewJob> {
    const current = await this.get(jobId);

    if (!current) {
      throw new Error(`Review job ${jobId} no longer exists`);
    }

    const updated: ReviewJob = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    await this.cache.set(
      jobKey(jobId),
      updated,
      config.REVIEW_JOB_TTL_SECONDS,
    );

    return updated;
  }

  async appendEvent(
    jobId: string,
    event: {
      detail?: string;
      level?: ReviewJobEventLevel;
      message: string;
      source?: ReviewJobEventSource;
    },
  ): Promise<ReviewJobEvent> {
    const entry: ReviewJobEvent = {
      detail: event.detail,
      id: randomUUID(),
      level: event.level ?? "info",
      message: event.message,
      source: event.source ?? "system",
      timestamp: new Date().toISOString(),
    };
    const events =
      (await this.cache.get<ReviewJobEvent[]>(eventsKey(jobId))) ?? [];

    await this.cache.set(
      eventsKey(jobId),
      [...events, entry].slice(-EVENT_LIMIT),
      config.REVIEW_JOB_TTL_SECONDS,
    );
    return entry;
  }

  async getSnapshot(jobId: string): Promise<ReviewJobSnapshot | null> {
    const [job, events] = await Promise.all([
      this.get(jobId),
      this.cache.get<ReviewJobEvent[]>(eventsKey(jobId)),
    ]);

    return job ? { events: events ?? [], job } : null;
  }

  async getActive(pullRequest: PullRequest): Promise<ReviewJob | null> {
    const activeId = await this.cache.get<string>(activeJobKey(pullRequest));
    if (!activeId) return null;

    const job = await this.get(activeId);
    if (!job || !isActive(job)) {
      await this.cache.delete(activeJobKey(pullRequest));
      return null;
    }

    return job;
  }

  async clearActive(job: ReviewJob): Promise<void> {
    const activeId = await this.cache.get<string>(
      activeJobKey(job.pullRequest),
    );

    if (activeId === job.id) {
      await this.cache.delete(activeJobKey(job.pullRequest));
    }
  }

  async getHistory(
    pullRequest: PullRequest,
  ): Promise<ReviewHistoryEntry[]> {
    return (
      (await this.cache.get<ReviewHistoryEntry[]>(
        historyKey(pullRequest),
      )) ?? []
    );
  }

  async appendHistory(
    pullRequest: PullRequest,
    entry: ReviewHistoryEntry,
  ): Promise<void> {
    const history = await this.getHistory(pullRequest);
    const nextHistory = [...history, entry].slice(-HISTORY_LIMIT);

    await this.cache.set(
      historyKey(pullRequest),
      nextHistory,
      config.REVIEW_JOB_TTL_SECONDS * 30,
    );
  }
}
