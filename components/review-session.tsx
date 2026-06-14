"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
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

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function statusTitle(status: ReviewJobStatus): string {
  switch (status) {
    case "queued":
      return "Waiting for a review worker";
    case "preparing":
      return "Preparing repository context";
    case "reviewing":
      return "Reviewing the pull request";
    case "posting":
      return "Posting the GitHub review";
    case "completed":
      return "Review completed";
    case "failed":
      return "Review failed";
  }
}

function EventRow({
  event,
}: {
  event: ReviewJobEvent;
}): React.ReactElement {
  return (
    <article className={`session-event event-${event.level}`}>
      <span className="event-marker" />
      <div className="event-copy">
        <div>
          <time dateTime={event.timestamp}>
            {formatTime(event.timestamp)}
          </time>
          <span className="event-source">{event.source}</span>
          <strong>{event.message}</strong>
        </div>
        {event.detail ? <pre>{event.detail}</pre> : null}
      </div>
    </article>
  );
}

export function ReviewSession({
  jobId,
}: {
  jobId: string;
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReviewJobSnapshot | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const response = await fetch(`/api/reviews/${jobId}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as ReviewJobSnapshot & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to load review session");
      }

      setSnapshot(body);
      setError(null);
      return body;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load review session",
      );
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadSnapshot(), 0);
    return () => window.clearTimeout(initialTimer);
  }, [loadSnapshot]);

  const active = snapshot
    ? ACTIVE_STATUSES.has(snapshot.job.status)
    : true;

  useEffect(() => {
    if (!active) {
      const finalTimer = window.setTimeout(
        () => void loadSnapshot(),
        500,
      );
      return () => window.clearTimeout(finalTimer);
    }

    const timer = window.setInterval(() => void loadSnapshot(), 1_000);
    return () => window.clearInterval(timer);
  }, [active, loadSnapshot]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [snapshot?.events.length]);

  const job = snapshot?.job;

  return (
    <main className="session-shell">
      <header className="session-topbar">
        <Link className="session-brand" href="/">
          <span>P</span>
          <div>
            <strong>PR Pilot</strong>
            <small>Live review session</small>
          </div>
        </Link>
        <Link className="back-link" href="/">
          Back to pull requests
        </Link>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="session-heading">
        <div>
          <p className="eyebrow">Review session</p>
          <h1>{job?.pullRequest.title ?? "Loading review session"}</h1>
          <p>
            {job
              ? `${job.pullRequest.repository}#${job.pullRequest.number}`
              : jobId}
          </p>
        </div>
        <div className={`session-status status-${job?.status ?? "queued"}`}>
          <span />
          <div>
            <strong>
              {job ? statusTitle(job.status) : "Loading session"}
            </strong>
            <small>{job?.updatedAt ? `Updated ${formatTime(job.updatedAt)}` : ""}</small>
          </div>
        </div>
      </section>

      <section className="session-grid">
        <aside className="session-sidebar">
          <div className="session-card">
            <span>Configuration</span>
            <dl>
              <div>
                <dt>Engine</dt>
                <dd>{job?.engine ?? "..."}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{job?.model ?? "..."}</dd>
              </div>
              <div>
                <dt>Reasoning</dt>
                <dd>{job?.reasoningEffort ?? "..."}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{job?.pullRequest.headRefName ?? "..."}</dd>
              </div>
              <div>
                <dt>Base</dt>
                <dd>{job?.pullRequest.baseRefName ?? "..."}</dd>
              </div>
              <div>
                <dt>Job</dt>
                <dd>{jobId}</dd>
              </div>
            </dl>
          </div>

          <div className="session-card session-links">
            <span>Links</span>
            {job ? (
              <a
                href={job.pullRequest.url}
                rel="noreferrer"
                target="_blank"
              >
                Open pull request
              </a>
            ) : null}
            {job?.commentUrl ? (
              <a href={job.commentUrl} rel="noreferrer" target="_blank">
                Open GitHub review
              </a>
            ) : null}
          </div>
        </aside>

        <div className="session-main">
          <section className="log-panel">
            <header>
              <div>
                <span className={active ? "live-dot log-live" : "live-dot"} />
                <strong>Session activity</strong>
              </div>
              <small>
                {active ? "Live updates" : `${snapshot?.events.length ?? 0} events`}
              </small>
            </header>
            <div className="event-list">
              {snapshot?.events.length ? (
                snapshot.events.map((event) => (
                  <EventRow event={event} key={event.id} />
                ))
              ) : (
                <div className="log-empty">Waiting for the first event...</div>
              )}
              <div ref={logEndRef} />
            </div>
          </section>

          {job?.error ? (
            <section className="result-panel result-error">
              <span>Failure</span>
              <pre>{job.error}</pre>
            </section>
          ) : null}

          {job?.result ? (
            <section className="result-panel">
              <span>Final review</span>
              <pre>{job.result}</pre>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
