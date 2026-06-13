import "server-only";

import { config } from "@/lib/config";
import { getCache } from "@/lib/cache";
import { runCommand } from "@/lib/shell";
import type { PullRequest, PullRequestList } from "@/lib/types";

const OPEN_PULL_REQUESTS_CACHE_KEY = "github:viewer:open-pull-requests:v1";

const OPEN_PULL_REQUESTS_QUERY = `
  query OpenPullRequests($limit: Int!) {
    viewer {
      login
      pullRequests(
        first: $limit
        states: OPEN
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        totalCount
        nodes {
          additions
          author { login }
          baseRefName
          changedFiles
          deletions
          headRefName
          headRefOid
          isDraft
          mergeStateStatus
          number
          repository { nameWithOwner }
          reviewDecision
          title
          updatedAt
          url
        }
      }
    }
  }
`;

interface GraphQlPullRequest {
  additions: number;
  author: { login: string } | null;
  baseRefName: string;
  changedFiles: number;
  deletions: number;
  headRefName: string;
  headRefOid: string;
  isDraft: boolean;
  mergeStateStatus: PullRequest["mergeState"];
  number: number;
  repository: { nameWithOwner: string };
  reviewDecision: PullRequest["reviewDecision"];
  title: string;
  updatedAt: string;
  url: string;
}

interface OpenPullRequestsResponse {
  data: {
    viewer: {
      login: string;
      pullRequests: {
        nodes: GraphQlPullRequest[];
        totalCount: number;
      };
    };
  };
}

export interface GitHubActor {
  login: string;
}

export interface PullRequestDetails {
  body: string | null;
  created_at: string;
  draft: boolean;
  head: {
    label: string;
    ref: string;
    sha: string;
  };
  html_url: string;
  labels: Array<{ name: string }>;
  requested_reviewers: GitHubActor[];
  title: string;
  updated_at: string;
  user: GitHubActor;
}

export interface IssueComment {
  body: string;
  created_at: string;
  html_url: string;
  updated_at: string;
  user: GitHubActor;
}

export interface ReviewComment extends IssueComment {
  diff_hunk: string;
  line: number | null;
  original_line: number | null;
  path: string;
  side: string | null;
}

export interface PullRequestReview {
  body: string | null;
  html_url: string;
  state: string;
  submitted_at: string | null;
  user: GitHubActor;
}

export interface PullRequestCommit {
  commit: {
    author: {
      date: string;
      name: string;
    };
    message: string;
  };
  html_url: string;
  sha: string;
}

export interface PullRequestFile {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  previous_filename?: string;
  status: string;
}

export interface CheckRun {
  conclusion: string | null;
  details_url: string | null;
  name: string;
  started_at: string | null;
  status: string;
}

export interface PullRequestContext {
  checkRuns: CheckRun[];
  commits: PullRequestCommit[];
  details: PullRequestDetails;
  files: PullRequestFile[];
  issueComments: IssueComment[];
  reviewComments: ReviewComment[];
  reviews: PullRequestReview[];
}

export interface PullRequestReviewCommentInput {
  body: string;
  line: number;
  path: string;
  side: "LEFT" | "RIGHT";
}

interface GhPullRequestView {
  author: GitHubActor;
  body: string;
  comments: Array<{
    author: GitHubActor;
    body: string;
    createdAt: string;
    url: string;
  }>;
  commits: Array<{
    authoredDate: string;
    authors: GitHubActor[];
    messageBody: string;
    messageHeadline: string;
    oid: string;
  }>;
  createdAt: string;
  files: Array<{
    additions: number;
    changeType: string;
    deletions: number;
    path: string;
  }>;
  headRefName: string;
  headRefOid: string;
  isDraft: boolean;
  labels: Array<{ name: string }>;
  reviewRequests: Array<{ login?: string; name?: string }>;
  reviews: Array<{
    author: GitHubActor;
    body: string;
    id: string;
    state: string;
    submittedAt: string | null;
  }>;
  statusCheckRollup: Array<{
    __typename: string;
    completedAt?: string | null;
    conclusion?: string | null;
    context?: string;
    detailsUrl?: string | null;
    name?: string;
    startedAt?: string | null;
    state?: string;
    status?: string;
    targetUrl?: string | null;
  }>;
  title: string;
  updatedAt: string;
  url: string;
}

declare global {
  var codexPilotContextRequests:
    | Map<string, Promise<PullRequestContext>>
    | undefined;
}

const contextRequests =
  globalThis.codexPilotContextRequests ??
  new Map<string, Promise<PullRequestContext>>();
globalThis.codexPilotContextRequests = contextRequests;

function mapPullRequest(node: GraphQlPullRequest): PullRequest {
  return {
    additions: node.additions,
    author: node.author?.login ?? "ghost",
    baseRefName: node.baseRefName,
    changedFiles: node.changedFiles,
    deletions: node.deletions,
    headRefName: node.headRefName,
    headSha: node.headRefOid,
    isDraft: node.isDraft,
    mergeState: node.mergeStateStatus,
    number: node.number,
    repository: node.repository.nameWithOwner,
    reviewDecision: node.reviewDecision,
    title: node.title,
    updatedAt: node.updatedAt,
    url: node.url,
  };
}

async function ghApiPaginated<T>(endpoint: string): Promise<T[]> {
  const { stdout } = await runCommand("gh", [
    "api",
    "--paginate",
    "--slurp",
    endpoint,
  ]);
  const pages = JSON.parse(stdout) as T[][];
  return pages.flat();
}

function githubWriteEnvironment(): NodeJS.ProcessEnv | undefined {
  if (!config.CODEX_GITHUB_TOKEN) {
    return undefined;
  }

  return {
    ...process.env,
    GH_TOKEN: config.CODEX_GITHUB_TOKEN,
  };
}

export async function fetchOpenPullRequests(): Promise<
  Omit<PullRequestList, "cached">
> {
  const { stdout } = await runCommand("gh", [
    "api",
    "graphql",
    "-f",
    `query=${OPEN_PULL_REQUESTS_QUERY}`,
    "-F",
    `limit=${config.MAX_OPEN_PRS}`,
  ]);

  const response = JSON.parse(stdout) as OpenPullRequestsResponse;
  const viewer = response.data.viewer;

  return {
    fetchedAt: new Date().toISOString(),
    login: viewer.login,
    pullRequests: viewer.pullRequests.nodes.map(mapPullRequest),
    totalCount: viewer.pullRequests.totalCount,
  };
}

export async function getPullRequestContext(
  pullRequest: PullRequest,
  refresh = false,
): Promise<PullRequestContext> {
  const cache = getCache();
  const cacheKey = [
    "github:pr-context:v1",
    pullRequest.repository,
    pullRequest.number,
    pullRequest.headSha,
    pullRequest.updatedAt,
  ].join(":");

  if (!refresh) {
    const cached = await cache.get<PullRequestContext>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const activeRequest = contextRequests.get(cacheKey);
  if (activeRequest) {
    return activeRequest;
  }

  const request = fetchPullRequestContext(pullRequest).finally(() => {
    contextRequests.delete(cacheKey);
  });
  contextRequests.set(cacheKey, request);

  const context = await request;
  await cache.set(
    cacheKey,
    context,
    config.PR_CONTEXT_CACHE_TTL_SECONDS,
  );
  return context;
}

async function fetchPullRequestContext(
  pullRequest: PullRequest,
): Promise<PullRequestContext> {
  const fields = [
    "author",
    "body",
    "comments",
    "commits",
    "createdAt",
    "files",
    "headRefName",
    "headRefOid",
    "isDraft",
    "labels",
    "reviewRequests",
    "reviews",
    "statusCheckRollup",
    "title",
    "updatedAt",
    "url",
  ].join(",");

  const [{ stdout }, reviewComments] = await Promise.all([
    runCommand("gh", [
      "pr",
      "view",
      String(pullRequest.number),
      "--repo",
      pullRequest.repository,
      "--json",
      fields,
    ]),
    ghApiPaginated<ReviewComment>(
      `repos/${pullRequest.repository}/pulls/${pullRequest.number}/comments?per_page=100`,
    ),
  ]);
  const view = JSON.parse(stdout) as GhPullRequestView;

  const details: PullRequestDetails = {
    body: view.body,
    created_at: view.createdAt,
    draft: view.isDraft,
    head: {
      label: view.headRefName,
      ref: view.headRefName,
      sha: view.headRefOid,
    },
    html_url: view.url,
    labels: view.labels,
    requested_reviewers: view.reviewRequests
      .map((reviewer) => reviewer.login ?? reviewer.name)
      .filter((login): login is string => Boolean(login))
      .map((login) => ({ login })),
    title: view.title,
    updated_at: view.updatedAt,
    user: view.author,
  };

  const issueComments: IssueComment[] = view.comments.map((comment) => ({
    body: comment.body,
    created_at: comment.createdAt,
    html_url: comment.url,
    updated_at: comment.createdAt,
    user: comment.author,
  }));

  const reviews: PullRequestReview[] = view.reviews.map((review) => ({
    body: review.body,
    html_url: view.url,
    state: review.state,
    submitted_at: review.submittedAt,
    user: review.author,
  }));

  const commits: PullRequestCommit[] = view.commits.map((commit) => ({
    commit: {
      author: {
        date: commit.authoredDate,
        name:
          commit.authors.map((author) => author.login).join(", ") ||
          "unknown",
      },
      message: [commit.messageHeadline, commit.messageBody]
        .filter(Boolean)
        .join("\n\n"),
    },
    html_url: `${view.url}/commits/${commit.oid}`,
    sha: commit.oid,
  }));

  const files: PullRequestFile[] = view.files.map((file) => ({
    additions: file.additions,
    changes: file.additions + file.deletions,
    deletions: file.deletions,
    filename: file.path,
    status: file.changeType.toLowerCase(),
  }));

  const checkRuns: CheckRun[] = view.statusCheckRollup.map((check) => ({
    conclusion: check.conclusion ?? check.state ?? null,
    details_url: check.detailsUrl ?? check.targetUrl ?? null,
    name: check.name ?? check.context ?? check.__typename,
    started_at: check.startedAt ?? null,
    status: check.status ?? check.state ?? "unknown",
  }));

  return {
    checkRuns,
    commits,
    details,
    files,
    issueComments,
    reviewComments,
    reviews,
  };
}

export async function createPullRequestComment(
  repository: string,
  number: number,
  body: string,
): Promise<{ id: number; url: string }> {
  const { stdout } = await runCommand("gh", [
    "api",
    "--method",
    "POST",
    `repos/${repository}/issues/${number}/comments`,
    "--input",
    "-",
  ], {
    env: githubWriteEnvironment(),
    input: JSON.stringify({ body }),
  });
  const response = JSON.parse(stdout) as { html_url: string; id: number };
  return { id: response.id, url: response.html_url };
}

export async function updatePullRequestComment(
  repository: string,
  commentId: number,
  body: string,
): Promise<void> {
  await runCommand("gh", [
    "api",
    "--method",
    "PATCH",
    `repos/${repository}/issues/comments/${commentId}`,
    "--input",
    "-",
  ], {
    env: githubWriteEnvironment(),
    input: JSON.stringify({ body }),
  });
}

export async function createPullRequestReview(
  pullRequest: PullRequest,
  body: string,
  comments: PullRequestReviewCommentInput[] = [],
): Promise<{ url: string }> {
  const { stdout } = await runCommand("gh", [
    "api",
    "--method",
    "POST",
    `repos/${pullRequest.repository}/pulls/${pullRequest.number}/reviews`,
    "--input",
    "-",
  ], {
    env: githubWriteEnvironment(),
    input: JSON.stringify({
      body,
      comments,
      commit_id: pullRequest.headSha,
      event: "COMMENT",
    }),
  });
  const response = JSON.parse(stdout) as { html_url: string };
  return { url: response.html_url };
}

export async function setCommitStatus(
  pullRequest: PullRequest,
  state: "error" | "failure" | "pending" | "success",
  description: string,
): Promise<void> {
  await runCommand("gh", [
    "api",
    "--method",
    "POST",
    `repos/${pullRequest.repository}/statuses/${pullRequest.headSha}`,
    "--input",
    "-",
  ], {
    env: githubWriteEnvironment(),
    input: JSON.stringify({
      context: "codex/review",
      description: description.slice(0, 140),
      state,
    }),
  });
}

export { OPEN_PULL_REQUESTS_CACHE_KEY };
