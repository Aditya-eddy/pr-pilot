import "server-only";

import { randomUUID } from "node:crypto";

import { config } from "@/lib/config";
import type {
  PullRequest,
  ReasoningEffort,
  ReviewJob,
} from "@/lib/types";
import { executeReview } from "@/lib/reviews/reviewer";
import { ReviewStore } from "@/lib/reviews/store";

class ReviewQueue {
  private activeCount = 0;
  private readonly activeByPullRequest = new Map<string, string>();
  private readonly pending: ReviewJob[] = [];
  private readonly store = new ReviewStore();

  async enqueue(
    pullRequest: PullRequest,
    model: string,
    reasoningEffort: ReasoningEffort,
    requestContext?: string,
    refreshContext = false,
  ): Promise<ReviewJob> {
    const pullRequestKey = `${pullRequest.repository}#${pullRequest.number}`;
    const activeJobId = this.activeByPullRequest.get(pullRequestKey);

    if (activeJobId) {
      const activeJob = await this.store.get(activeJobId);
      if (activeJob) {
        return activeJob;
      }
      this.activeByPullRequest.delete(pullRequestKey);
    }

    const persistedActiveJob = await this.store.getActive(pullRequest);
    if (persistedActiveJob) {
      this.activeByPullRequest.set(pullRequestKey, persistedActiveJob.id);
      return persistedActiveJob;
    }

    const now = new Date().toISOString();
    const job: ReviewJob = {
      createdAt: now,
      id: randomUUID(),
      model,
      pullRequest,
      reasoningEffort,
      refreshContext,
      requestContext,
      status: "queued",
      updatedAt: now,
    };

    await this.store.create(job);
    await this.store.appendEvent(job.id, {
      level: "activity",
      message: "Review queued",
      source: "system",
    });
    this.activeByPullRequest.set(pullRequestKey, job.id);
    this.pending.push(job);
    queueMicrotask(() => void this.drain());

    return job;
  }

  get(jobId: string): Promise<ReviewJob | null> {
    return this.store.get(jobId);
  }

  getSnapshot(jobId: string) {
    return this.store.getSnapshot(jobId);
  }

  async getActive(pullRequests: PullRequest[]): Promise<ReviewJob[]> {
    const jobs = await Promise.all(
      pullRequests.map((pullRequest) => this.store.getActive(pullRequest)),
    );
    return jobs.filter((job): job is ReviewJob => job !== null);
  }

  private async drain(): Promise<void> {
    while (
      this.activeCount < config.REVIEW_CONCURRENCY &&
      this.pending.length > 0
    ) {
      const job = this.pending.shift();
      if (!job) {
        return;
      }

      this.activeCount += 1;
      void executeReview(job, this.store).finally(async () => {
        this.activeCount -= 1;
        this.activeByPullRequest.delete(
          `${job.pullRequest.repository}#${job.pullRequest.number}`,
        );
        await this.store.clearActive(job);
        void this.drain();
      });
    }
  }
}

declare global {
  var codexPilotReviewQueue: ReviewQueue | undefined;
  var codexPilotReviewQueueVersion: string | undefined;
}

const REVIEW_QUEUE_VERSION = "4";

export function getReviewQueue(): ReviewQueue {
  if (
    !globalThis.codexPilotReviewQueue ||
    globalThis.codexPilotReviewQueueVersion !== REVIEW_QUEUE_VERSION
  ) {
    globalThis.codexPilotReviewQueue = new ReviewQueue();
    globalThis.codexPilotReviewQueueVersion = REVIEW_QUEUE_VERSION;
  }

  return globalThis.codexPilotReviewQueue;
}
