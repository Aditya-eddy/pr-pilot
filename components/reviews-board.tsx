"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  ReviewJob,
  ReviewJobEvent,
  ReviewJobSnapshot,
  ReviewJobStatus,
} from "@/lib/types";

const ACTIVE_STATUSES = new Set<ReviewJobStatus>([
  "queued",
  "preparing",
  "reviewing",
  "posting",
]);

const FEED_POLL_MS = 3_000;
const LOG_POLL_MS = 1_500;

function isActive(status: ReviewJobStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function timeAgo(timestamp: string): string {
  const delta = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function EventRow({ event }: { event: ReviewJobEvent }): React.ReactElement {
  return (
    <article className={`session-event event-${event.level}`}>
      <span className="event-marker" />
      <div className="event-copy">
        <div>
          <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
          <span className="event-source">{event.source}</span>
          <strong>{event.message}</strong>
        </div>
        {event.detail ? <pre>{event.detail}</pre> : null}
      </div>
    </article>
  );
}

export function ReviewsBoard(): React.ReactElement {
  const [jobs, setJobs] = useState<ReviewJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReviewJobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFeed = async (): Promise<void> => {
      try {
        const response = await fetch("/api/reviews/feed?limit=50", {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          error?: string;
          jobs?: ReviewJob[];
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load reviews");
        }
        if (cancelled) return;

        const list = body.jobs ?? [];
        setJobs(list);
        setError(null);
        setLoaded(true);
        setSelectedId((current) => {
          if (current && list.some((job) => job.id === current)) {
            return current;
          }
          const active = list.find((job) => isActive(job.status));
          return active?.id ?? list[0]?.id ?? null;
        });
      } catch (loadError) {
        if (cancelled) return;
        setLoaded(true);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load reviews",
        );
      }
    };

    void loadFeed();
    const timer = window.setInterval(() => void loadFeed(), FEED_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    let active = true;

    const loadSnapshot = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/reviews/${selectedId}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as ReviewJobSnapshot;
        if (active) setSnapshot(body);
      } catch {
        // A later poll recovers from a transient failure.
      }
    };

    void loadSnapshot();
    const timer = window.setInterval(() => void loadSnapshot(), LOG_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [snapshot?.events.length]);

  const activeCount = jobs.filter((job) => isActive(job.status)).length;
  // Only trust the snapshot if it matches the current selection; otherwise it's
  // a stale fetch from the previously-selected review still settling.
  const selectedSnapshot =
    snapshot && snapshot.job.id === selectedId ? snapshot : null;
  const selectedJob =
    selectedSnapshot?.job ??
    jobs.find((job) => job.id === selectedId) ??
    null;
  const selectedActive = selectedJob ? isActive(selectedJob.status) : false;
  const events = selectedSnapshot?.events ?? [];

  return (
    <main className="session-shell">
      <header className="session-topbar">
        <Link className="session-brand" href="/">
          <span>P</span>
          <div>
            <strong>PR Pilot</strong>
            <small>Review activity</small>
          </div>
        </Link>
        <Link className="back-link" href="/">
          Back to pull requests
        </Link>
      </header>

      <section className="session-heading">
        <div>
          <p className="eyebrow">Activity</p>
          <h1>Ongoing reviews</h1>
          <p>
            {activeCount > 0
              ? `${activeCount} review${activeCount === 1 ? "" : "s"} running`
              : "No reviews running right now"}
            {" · "}
            {jobs.length} recent
          </p>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="board-grid">
        <div className="board-list">
          {!loaded ? (
            <div className="board-empty">Loading reviews…</div>
          ) : jobs.length === 0 ? (
            <div className="board-empty">
              <strong>No reviews yet</strong>
              <span>Trigger one from the dashboard or the pilot skill.</span>
            </div>
          ) : (
            jobs.map((job) => (
              <button
                className={`board-item${job.id === selectedId ? " selected" : ""}`}
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                type="button"
              >
                <div className="board-item-top">
                  <span className="board-repo">
                    {job.pullRequest.repository}#{job.pullRequest.number}
                  </span>
                  <span className={`job-status job-${job.status}`}>
                    <span />
                    {job.status}
                  </span>
                </div>
                <span className="board-title">{job.pullRequest.title}</span>
                <div className="board-meta">
                  <span>
                    {job.engine ?? "codex"} {job.model}/{job.reasoningEffort}
                  </span>
                  <span>{timeAgo(job.updatedAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="session-main">
          <section className="log-panel">
            <header>
              <div>
                <span className={selectedActive ? "live-dot log-live" : "live-dot"} />
                <strong>
                  {selectedJob
                    ? `${selectedJob.pullRequest.repository}#${selectedJob.pullRequest.number}`
                    : "Logs"}
                </strong>
              </div>
              <small>
                {selectedJob
                  ? selectedActive
                    ? "Live updates"
                    : `${events.length} events`
                  : "Select a review"}
                {selectedId ? (
                  <>
                    {" · "}
                    <Link className="review-link" href={`/reviews/${selectedId}`}>
                      Full session
                    </Link>
                  </>
                ) : null}
              </small>
            </header>
            <div className="event-list">
              {!selectedId ? (
                <div className="log-empty">
                  Select a review to stream its logs.
                </div>
              ) : events.length > 0 ? (
                events.map((event) => <EventRow event={event} key={event.id} />)
              ) : (
                <div className="log-empty">Waiting for the first event…</div>
              )}
              <div ref={logEndRef} />
            </div>
          </section>

          {selectedJob?.error ? (
            <section className="result-panel result-error">
              <span>Failure</span>
              <pre>{selectedJob.error}</pre>
            </section>
          ) : null}

          {selectedJob?.result ? (
            <section className="result-panel">
              <span>Final review</span>
              <pre>{selectedJob.result}</pre>
            </section>
          ) : null}

          {selectedJob?.commentUrl ? (
            <section className="result-panel">
              <span>GitHub</span>
              <a href={selectedJob.commentUrl} rel="noreferrer" target="_blank">
                Open GitHub review
              </a>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
