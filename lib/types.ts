export type ReviewDecision =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | null;

export type MergeState =
  | "BEHIND"
  | "BLOCKED"
  | "CLEAN"
  | "DIRTY"
  | "DRAFT"
  | "HAS_HOOKS"
  | "UNKNOWN"
  | "UNSTABLE";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type Engine = "codex" | "claude";

export interface CodexUsageWindow {
  remainingPercent: number;
  resetsAt: string | null;
  usedPercent: number;
  windowDurationMinutes: number | null;
}

export interface CodexModelOption {
  defaultReasoningEffort: ReasoningEffort;
  description: string;
  displayName: string;
  id: string;
  isDefault: boolean;
  reasoningEfforts: Array<{
    description: string;
    value: ReasoningEffort;
  }>;
}

export interface CodexStatus {
  credits: {
    balance: string | null;
    hasCredits: boolean;
    unlimited: boolean;
  } | null;
  fetchedAt: string;
  models: CodexModelOption[];
  planType: string | null;
  primary: CodexUsageWindow | null;
  rateLimitReachedType: string | null;
  secondary: CodexUsageWindow | null;
}

export interface ClaudeRateLimitWindow {
  label: string;
  rateLimitType: string;
  resetsAt: string | null;
  status: string;
}

export interface ClaudeStatus {
  fetchedAt: string;
  model: string;
  windows: ClaudeRateLimitWindow[];
}

export interface PullRequest {
  additions: number;
  author: string;
  baseRefName: string;
  changedFiles: number;
  deletions: number;
  headRefName: string;
  headSha: string;
  isDraft: boolean;
  mergeState: MergeState;
  number: number;
  repository: string;
  reviewDecision: ReviewDecision;
  title: string;
  updatedAt: string;
  url: string;
}

export type ReviewJobStatus =
  | "queued"
  | "preparing"
  | "reviewing"
  | "posting"
  | "completed"
  | "failed";

export type ReviewJobEventLevel =
  | "activity"
  | "error"
  | "info"
  | "success"
  | "warning";

export type ReviewJobEventSource =
  | "claude"
  | "codex"
  | "git"
  | "github"
  | "system";

export interface ReviewJobEvent {
  detail?: string;
  id: string;
  level: ReviewJobEventLevel;
  message: string;
  source: ReviewJobEventSource;
  timestamp: string;
}

export interface ReviewJob {
  commentUrl?: string;
  createdAt: string;
  engine: Engine;
  error?: string;
  id: string;
  model: string;
  pullRequest: PullRequest;
  reasoningEffort: ReasoningEffort;
  refreshContext?: boolean;
  requestContext?: string;
  result?: string;
  status: ReviewJobStatus;
  updatedAt: string;
}

export interface ReviewJobSnapshot {
  events: ReviewJobEvent[];
  job: ReviewJob;
}

export interface ReviewHistoryEntry {
  completedAt: string;
  jobId: string;
  result: string;
}

export interface PullRequestList {
  cached: boolean;
  fetchedAt: string;
  login: string;
  pullRequests: PullRequest[];
  totalCount: number;
}
