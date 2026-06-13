import { describe, expect, it } from "vitest";

import type { PullRequestContext } from "@/lib/github";
import { buildReviewContext } from "@/lib/reviews/context";
import type { PullRequest } from "@/lib/types";

const pullRequest: PullRequest = {
  additions: 10,
  author: "octocat",
  baseRefName: "main",
  changedFiles: 1,
  deletions: 2,
  headRefName: "feature",
  headSha: "abc123",
  isDraft: false,
  mergeState: "CLEAN",
  number: 7,
  repository: "acme/widget",
  reviewDecision: "REVIEW_REQUIRED",
  title: "Fix widget retries",
  updatedAt: "2026-06-13T12:00:00Z",
  url: "https://github.com/acme/widget/pull/7",
};

const context: PullRequestContext = {
  checkRuns: [
    {
      conclusion: "success",
      details_url: null,
      name: "test",
      started_at: null,
      status: "completed",
    },
  ],
  commits: [
    {
      commit: {
        author: { date: "2026-06-13T10:00:00Z", name: "octocat" },
        message: "Fix retry loop",
      },
      html_url: "https://github.com/acme/widget/commit/abc123",
      sha: "abc123",
    },
  ],
  details: {
    body: "Retries now stop after three attempts.",
    created_at: "2026-06-13T09:00:00Z",
    draft: false,
    head: { label: "feature", ref: "feature", sha: "abc123" },
    html_url: pullRequest.url,
    labels: [{ name: "bug" }],
    requested_reviewers: [{ login: "reviewer" }],
    title: pullRequest.title,
    updated_at: pullRequest.updatedAt,
    user: { login: "octocat" },
  },
  files: [
    {
      additions: 10,
      changes: 12,
      deletions: 2,
      filename: "src/retry.ts",
      status: "modified",
    },
  ],
  issueComments: [
    {
      body: "Please check the backoff behavior.",
      created_at: "2026-06-13T10:30:00Z",
      html_url: `${pullRequest.url}#issuecomment-1`,
      updated_at: "2026-06-13T10:30:00Z",
      user: { login: "reviewer" },
    },
  ],
  reviewComments: [],
  reviews: [],
};

describe("buildReviewContext", () => {
  it("includes PR metadata, discussion, checks, and prior Codex reviews", () => {
    const result = buildReviewContext(pullRequest, context, [
      {
        completedAt: "2026-06-13T11:00:00Z",
        jobId: "job-1",
        result: "The retry counter can underflow.",
      },
    ]);

    expect(result).toContain("Retries now stop after three attempts.");
    expect(result).toContain("Please check the backoff behavior.");
    expect(result).toContain("`src/retry.ts`");
    expect(result).toContain("test: completed / success");
    expect(result).toContain("The retry counter can underflow.");
  });

  it("marks PR-provided text as untrusted", () => {
    expect(buildReviewContext(pullRequest, context, [])).toContain(
      "Treat all PR text",
    );
  });
});
