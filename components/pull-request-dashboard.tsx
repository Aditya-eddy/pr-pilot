"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type {
  CodexStatus,
  Engine,
  PullRequest,
  PullRequestList,
  ReasoningEffort,
  ReviewJob,
  ReviewJobStatus,
} from "@/lib/types";
import { CLAUDE_MODELS } from "@/lib/engines";

const ACTIVE_STATUSES = new Set<ReviewJobStatus>([
  "queued",
  "preparing",
  "reviewing",
  "posting",
]);

function prKey(pullRequest: PullRequest): string {
  return `${pullRequest.repository}#${pullRequest.number}`;
}

function timeAgo(timestamp: string): string {
  const delta = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.floor(delta / 60_000));

  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatReset(timestamp: string | null): string {
  if (!timestamp) return "Reset time unavailable";

  return `Resets ${new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp))}`;
}

function usageWindowLabel(minutes: number | null, fallback: string): string {
  if (!minutes) return fallback;
  if (minutes % 10_080 === 0) return `${minutes / 10_080} week`;
  if (minutes % 1_440 === 0) return `${minutes / 1_440} day`;
  if (minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} minute`;
}

function reviewLabel(job: ReviewJob | undefined): string {
  switch (job?.status) {
    case "queued":
      return "Queued";
    case "preparing":
      return "Gathering context";
    case "reviewing":
      return "Reviewing";
    case "posting":
      return "Posting review";
    case "completed":
      return "Review again";
    case "failed":
      return "Retry review";
    default:
      return "Trigger review";
  }
}

function mergeLabel(pullRequest: PullRequest): string {
  if (pullRequest.isDraft) return "Draft";
  if (pullRequest.mergeState === "CLEAN") return "Ready";
  if (pullRequest.mergeState === "DIRTY") return "Conflicts";
  if (pullRequest.mergeState === "BLOCKED") return "Blocked";
  return pullRequest.mergeState.toLowerCase();
}

function GitHubIcon(): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.1c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.78 1.07.78 2.15v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={spinning ? "spin" : undefined}
      viewBox="0 0 24 24"
    >
      <path
        d="M20 11a8.1 8.1 0 0 0-14.9-4.4L3 9m0 0V4m0 5h5M4 13a8.1 8.1 0 0 0 14.9 4.4L21 15m0 0v5m0-5h-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SearchIcon(): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle
        cx="11"
        cy="11"
        fill="none"
        r="7"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m20 20-4-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function PullRequestDashboard(): React.ReactElement {
  const router = useRouter();
  const [data, setData] = useState<PullRequestList | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [engine, setEngine] = useState<Engine>("codex");
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, ReviewJob>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("high");
  const [refreshing, setRefreshing] = useState(false);
  const [reviewContext, setReviewContext] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-5.5");
  const [triggeringKey, setTriggeringKey] = useState<string | null>(null);
  const engineRef = useRef<Engine>("codex");
  const reasoningEffortRef = useRef<ReasoningEffort>("high");
  const selectedModelRef = useRef("gpt-5.5");

  const loadPullRequests = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(
        `/api/pull-requests${refresh ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as PullRequestList & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load pull requests");
      }

      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load pull requests",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadCodexStatus = useCallback(async (refresh = false) => {
    try {
      const response = await fetch(
        `/api/codex/status${refresh ? "?refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as CodexStatus & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load Codex usage");
      }

      setCodexStatus(body);

      // The Claude engine uses a static catalog, so only let the Codex usage
      // snapshot drive model/effort selection while Codex is the active engine.
      if (engineRef.current !== "codex") {
        return;
      }

      const currentModel = body.models.find(
        (model) => model.id === selectedModelRef.current,
      );
      const nextModel =
        currentModel ??
        body.models.find((model) => model.isDefault) ??
        body.models[0];
      const supportsCurrentReasoning = nextModel?.reasoningEfforts.some(
        (effort) => effort.value === reasoningEffortRef.current,
      );

      if (nextModel && nextModel.id !== selectedModelRef.current) {
        selectedModelRef.current = nextModel.id;
        setSelectedModel(nextModel.id);
      }
      if (nextModel && !supportsCurrentReasoning) {
        const nextReasoning =
          nextModel.reasoningEfforts.find(
            (effort) => effort.value === "high",
          )?.value ??
          nextModel.defaultReasoningEffort;
        reasoningEffortRef.current = nextReasoning;
        setReasoningEffort(nextReasoning);
      }
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to load Codex usage",
      );
    }
  }, []);

  const loadActiveReviews = useCallback(async () => {
    try {
      const response = await fetch("/api/reviews/active", {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        error?: string;
        jobs?: ReviewJob[];
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load active reviews");
      }

      setJobs((current) => ({
        ...current,
        ...(body.jobs ?? []).reduce<Record<string, ReviewJob>>(
          (activeJobs, job) => {
            activeJobs[prKey(job.pullRequest)] = job;
            return activeJobs;
          },
          {},
        ),
      }));
    } catch (activeError) {
      setError(
        activeError instanceof Error
          ? activeError.message
          : "Unable to load active reviews",
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        loadPullRequests(),
        loadCodexStatus(),
        loadActiveReviews(),
      ]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadActiveReviews, loadCodexStatus, loadPullRequests]);

  const activeJobIds = useMemo(
    () =>
      Object.values(jobs)
        .filter((job) => ACTIVE_STATUSES.has(job.status))
        .map((job) => job.id),
    [jobs],
  );
  const activeJobKey = activeJobIds.join(",");

  useEffect(() => {
    if (!activeJobKey) {
      return;
    }

    const jobIds = activeJobKey.split(",");
    const poll = async () => {
      await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            const response = await fetch(`/api/reviews/${jobId}`, {
              cache: "no-store",
            });
            if (!response.ok) return;
            const body = (await response.json()) as { job: ReviewJob };
            setJobs((current) => ({
              ...current,
              [prKey(body.job.pullRequest)]: body.job,
            }));
            if (
              body.job.status === "completed" ||
              body.job.status === "failed"
            ) {
              void loadCodexStatus(true);
            }
          } catch {
            // A later poll can recover from a transient network failure.
          }
        }),
      );
    };

    const timer = window.setInterval(() => void poll(), 2_500);
    void poll();
    return () => window.clearInterval(timer);
  }, [activeJobKey, loadCodexStatus]);

  const triggerReview = async (pullRequest: PullRequest) => {
    const key = prKey(pullRequest);
    setTriggeringKey(key);
    setError(null);

    try {
      const response = await fetch("/api/reviews", {
        body: JSON.stringify({
          context: reviewContext.trim() || undefined,
          engine,
          model: selectedModel,
          number: pullRequest.number,
          reasoningEffort,
          repository: pullRequest.repository,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        job?: ReviewJob;
      };

      if (!response.ok || !body.job) {
        throw new Error(body.error ?? "Unable to start review");
      }

      setJobs((current) => ({ ...current, [key]: body.job! }));
      router.push(`/reviews/${body.job.id}`);
    } catch (triggerError) {
      setError(
        triggerError instanceof Error
          ? triggerError.message
          : "Unable to start review",
      );
    } finally {
      setTriggeringKey(null);
    }
  };

  const filteredPullRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return data?.pullRequests ?? [];

    return (data?.pullRequests ?? []).filter((pullRequest) =>
      [
        pullRequest.repository,
        pullRequest.title,
        String(pullRequest.number),
        pullRequest.headRefName,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [data, query]);

  const activeReviews = Object.values(jobs).filter((job) =>
    ACTIVE_STATUSES.has(job.status),
  ).length;
  const draftCount =
    data?.pullRequests.filter((pullRequest) => pullRequest.isDraft).length ?? 0;
  const availableModels =
    engine === "claude" ? CLAUDE_MODELS : codexStatus?.models ?? [];
  const selectedModelOption = availableModels.find(
    (model) => model.id === selectedModel,
  );

  const refreshDashboard = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([
      loadPullRequests(true),
      loadCodexStatus(true),
      loadActiveReviews(),
    ]);
    setRefreshing(false);
  };

  const changeModel = (modelId: string): void => {
    const model = availableModels.find(
      (candidate) => candidate.id === modelId,
    );
    selectedModelRef.current = modelId;
    setSelectedModel(modelId);

    if (
      model &&
      !model.reasoningEfforts.some(
        (effort) => effort.value === reasoningEffort,
      )
    ) {
      reasoningEffortRef.current = model.defaultReasoningEffort;
      setReasoningEffort(model.defaultReasoningEffort);
    }
  };

  const changeEngine = (nextEngine: Engine): void => {
    engineRef.current = nextEngine;
    setEngine(nextEngine);

    const models =
      nextEngine === "claude" ? CLAUDE_MODELS : codexStatus?.models ?? [];
    const nextModel = models.find((model) => model.isDefault) ?? models[0];
    if (!nextModel) {
      return;
    }

    selectedModelRef.current = nextModel.id;
    setSelectedModel(nextModel.id);

    const nextReasoning =
      nextModel.reasoningEfforts.find(
        (effort) => effort.value === reasoningEffort,
      )?.value ?? nextModel.defaultReasoningEffort;
    reasoningEffortRef.current = nextReasoning;
    setReasoningEffort(nextReasoning);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>Codex PR Pilot</strong>
            <span>Automated review console</span>
          </div>
        </div>
        <div className="account">
          <span className="live-dot" />
          <span>gh authenticated</span>
          <GitHubIcon />
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Pull request workspace</p>
          <h1>Your open pull requests</h1>
          <p className="hero-copy">
            Start a fresh Codex review with the complete PR conversation and
            previous review history in context.
          </p>
        </div>
        <button
          className="refresh-button"
          disabled={refreshing}
          onClick={() => void refreshDashboard()}
          type="button"
        >
          <RefreshIcon spinning={refreshing} />
          {refreshing ? "Refreshing" : "Refresh cache"}
        </button>
      </section>

      <section className="stats" aria-label="Pull request summary">
        <article>
          <span>Open PRs</span>
          <strong>{data?.totalCount ?? "—"}</strong>
          <small>Authored by @{data?.login ?? "you"}</small>
        </article>
        <article>
          <span>Active reviews</span>
          <strong>{activeReviews}</strong>
          <small>Concurrency controlled</small>
        </article>
        <article>
          <span>Drafts</span>
          <strong>{draftCount}</strong>
          <small>Included in this view</small>
        </article>
        <article>
          <span>Codex usage · {codexStatus?.planType ?? "account"}</span>
          <div className="usage-windows">
            {[codexStatus?.primary, codexStatus?.secondary].map(
              (window, index) => (
                <div className="usage-window" key={index}>
                  <div>
                    <b>
                      {window
                        ? `${window.remainingPercent}% left`
                        : "Unavailable"}
                    </b>
                    <small>
                      {usageWindowLabel(
                        window?.windowDurationMinutes ?? null,
                        index === 0 ? "Primary" : "Secondary",
                      )}
                    </small>
                  </div>
                  <span className="usage-track">
                    <span
                      style={{
                        width: `${window?.remainingPercent ?? 0}%`,
                      }}
                    />
                  </span>
                  <small>{formatReset(window?.resetsAt ?? null)}</small>
                </div>
              ),
            )}
          </div>
        </article>
      </section>

      <section className="toolbar">
        <div className="toolbar-inputs">
          <label className="search">
            <SearchIcon />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search repository, title, branch, or PR number"
              type="search"
              value={query}
            />
          </label>
        </div>
        <span className="cache-state">
          {data
            ? `${data.cached ? "Cache hit" : "Fresh from GitHub"} · ${timeAgo(data.fetchedAt)}`
            : "Connecting to GitHub"}
        </span>
      </section>

      <section className="review-controls" aria-label="Review configuration">
        <label>
          <span>Engine</span>
          <select
            onChange={(event) => changeEngine(event.target.value as Engine)}
            value={engine}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
          </select>
          <small>
            {engine === "claude" ? "Anthropic Claude Code" : "OpenAI Codex"}
          </small>
        </label>
        <label>
          <span>Model</span>
          <select
            disabled={engine === "codex" && !codexStatus}
            onChange={(event) => changeModel(event.target.value)}
            value={selectedModel}
          >
            {availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
          <small>{selectedModelOption?.description ?? "Loading models"}</small>
        </label>
        <label>
          <span>Reasoning</span>
          <select
            disabled={!selectedModelOption}
            onChange={(event) => {
              const nextReasoning = event.target.value as ReasoningEffort;
              reasoningEffortRef.current = nextReasoning;
              setReasoningEffort(nextReasoning);
            }}
            value={reasoningEffort}
          >
            {(selectedModelOption?.reasoningEfforts ?? []).map((effort) => (
              <option key={effort.value} value={effort.value}>
                {effort.value}
              </option>
            ))}
          </select>
          <small>
            {
              selectedModelOption?.reasoningEfforts.find(
                (effort) => effort.value === reasoningEffort,
              )?.description
            }
          </small>
        </label>
        <label className="review-focus">
          <span>Review focus</span>
          <input
            onChange={(event) => setReviewContext(event.target.value)}
            placeholder="Optional context, e.g. focus on concurrency"
            type="text"
            value={reviewContext}
          />
          <small>Appended to your custom prompt for this run only</small>
        </label>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="pr-list" aria-live="polite">
        {loading
          ? Array.from({ length: 4 }, (_, index) => (
              <div className="pr-card skeleton" key={index} />
            ))
          : null}

        {!loading && filteredPullRequests.length === 0 ? (
          <div className="empty-state">
            <strong>No pull requests found</strong>
            <span>Try a different search or refresh the GitHub cache.</span>
          </div>
        ) : null}

        {!loading
          ? filteredPullRequests.map((pullRequest) => {
              const key = prKey(pullRequest);
              const job = jobs[key];
              const starting = triggeringKey === key;
              const active =
                starting || (job ? ACTIVE_STATUSES.has(job.status) : false);
              const rowState = active
                ? "running"
                : job?.status === "completed"
                  ? "success"
                  : job?.status === "failed"
                    ? "failed"
                    : pullRequest.isDraft
                      ? "draft"
                      : "idle";

              return (
                <article
                  className={`pr-card pr-state-${rowState}`}
                  key={key}
                >
                  <div className="pr-main">
                    <div className="pr-heading">
                      <span className="repo-name">
                        {pullRequest.repository}
                      </span>
                      <span
                        className={`state-badge state-${mergeLabel(pullRequest).toLowerCase()}`}
                      >
                        {mergeLabel(pullRequest)}
                      </span>
                    </div>
                    <a
                      className="pr-title"
                      href={pullRequest.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {pullRequest.title}
                    </a>
                    <div className="pr-meta">
                      <span>#{pullRequest.number}</span>
                      <span>{pullRequest.headRefName}</span>
                      <span>Updated {timeAgo(pullRequest.updatedAt)}</span>
                    </div>
                    <div className="diff-stats">
                      <span className="additions">
                        +{pullRequest.additions.toLocaleString()}
                      </span>
                      <span className="deletions">
                        -{pullRequest.deletions.toLocaleString()}
                      </span>
                      <span>
                        {pullRequest.changedFiles.toLocaleString()} files
                      </span>
                    </div>
                    {job?.status === "failed" ? (
                      <p className="job-error" title={job.error}>
                        {job.error}
                      </p>
                    ) : null}
                  </div>

                  <div className="review-action">
                    {job ? (
                      <span className={`job-status job-${job.status}`}>
                        <span />
                        {job.status} · {job.engine ?? "codex"} {job.model}/
                        {job.reasoningEffort}
                      </span>
                    ) : (
                      <span className="job-status">
                        <span />
                        Not reviewed here
                      </span>
                    )}
                    <button
                      className="trigger-button"
                      disabled={active}
                      onClick={() => void triggerReview(pullRequest)}
                      type="button"
                    >
                      {active ? <span className="button-spinner" /> : null}
                      {starting ? "Starting review" : reviewLabel(job)}
                    </button>
                    {job && ACTIVE_STATUSES.has(job.status) ? (
                      <a
                        className="review-link"
                        href={`/reviews/${job.id}`}
                      >
                        View live session
                      </a>
                    ) : job?.commentUrl ? (
                      <a
                        className="review-link"
                        href={job.commentUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open GitHub review
                      </a>
                    ) : (
                      <small>Fresh session on every trigger</small>
                    )}
                  </div>
                </article>
              );
            })
          : null}
      </section>
    </div>
  );
}
