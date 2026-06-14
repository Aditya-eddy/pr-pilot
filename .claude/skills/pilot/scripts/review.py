#!/usr/bin/env python3
"""Trigger a PR Pilot review via the local API and stream its progress.

This calls the running PR Pilot app (default http://127.0.0.1:5050):
  POST /api/reviews          -> enqueue a review job
  GET  /api/reviews/{jobId}  -> poll the job snapshot ({ job, events })

It uses only the standard library so it can run without installing anything.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

TERMINAL_STATUSES = {"completed", "failed"}


def gh(args: list[str]) -> str:
    """Run a `gh` command and return trimmed stdout, or "" on failure."""
    try:
        result = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def http_json(method: str, url: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, {"error": raw or error.reason}
    except urllib.error.URLError as error:
        raise SystemExit(
            f"Cannot reach PR Pilot at {url}. Is the app running? "
            f"Start it from the repo root with `npm run dev`. ({error.reason})"
        )


def resolve_target(args) -> tuple[str, int]:
    repository = args.repository or gh(
        ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]
    )
    number = args.number
    if number is None:
        detected = gh(["pr", "view", "--json", "number", "-q", ".number"])
        number = int(detected) if detected.isdigit() else None

    if not repository or not number:
        raise SystemExit(
            "Could not determine the pull request. Pass "
            "--repository owner/repo --number N, or run inside a checked-out "
            "branch that has an open PR."
        )
    return repository, number


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trigger a PR Pilot review and stream its progress.",
    )
    parser.add_argument("--repository", help="owner/repo (default: current gh repo)")
    parser.add_argument("--number", type=int, help="PR number (default: current branch PR)")
    parser.add_argument("--engine", choices=["codex", "claude"], default="codex")
    parser.add_argument(
        "--model",
        default="gpt-5.5",
        help="Model id (e.g. gpt-5.5, opus, sonnet, haiku)",
    )
    parser.add_argument(
        "--reasoning", choices=["low", "medium", "high", "xhigh"], default="medium"
    )
    parser.add_argument("--context", help="Optional review focus for this run")
    parser.add_argument("--refresh-context", action="store_true")
    parser.add_argument("--base-url", default="http://127.0.0.1:5050")
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()

    repository, number = resolve_target(args)
    base = args.base_url.rstrip("/")

    payload: dict = {
        "repository": repository,
        "number": number,
        "refreshContext": args.refresh_context,
    }
    if args.engine:
        payload["engine"] = args.engine
    if args.model:
        payload["model"] = args.model
    if args.reasoning:
        payload["reasoningEffort"] = args.reasoning
    if args.context:
        payload["context"] = args.context

    engine_note = f" [{args.engine}]" if args.engine else ""
    print(f"-> Requesting review for {repository}#{number}{engine_note}", flush=True)

    status, body = http_json("POST", f"{base}/api/reviews", payload)
    if status not in (200, 202) or "job" not in body:
        raise SystemExit(
            f"Failed to start review (HTTP {status}): "
            f"{body.get('error', body)}"
        )

    job = body["job"]
    job_id = job["id"]
    print(
        f"-> Job {job_id} "
        f"({job.get('engine', '?')} {job.get('model', '?')}/"
        f"{job.get('reasoningEffort', '?')})",
        flush=True,
    )

    seen_events: set[str] = set()
    deadline = time.time() + args.timeout

    while True:
        time.sleep(3)
        if time.time() > deadline:
            raise SystemExit(
                f"Timed out after {args.timeout}s waiting for the review."
            )

        status, snapshot = http_json("GET", f"{base}/api/reviews/{job_id}")
        if status == 404:
            raise SystemExit("Review job not found or expired.")

        for event in snapshot.get("events", []):
            event_id = event.get("id")
            if not event_id or event_id in seen_events:
                continue
            seen_events.add(event_id)
            source = event.get("source", "system")
            print(f"   [{source}] {event.get('message', '')}", flush=True)

        job = snapshot.get("job", {})
        if job.get("status") in TERMINAL_STATUSES:
            break

    if job.get("status") == "failed":
        print(f"\nx Review failed: {job.get('error', 'unknown error')}", flush=True)
        sys.exit(1)

    print("\nReview completed.", flush=True)
    if job.get("commentUrl"):
        print(f"GitHub review: {job['commentUrl']}", flush=True)
    if job.get("result"):
        print("\n----- Review -----\n" + job["result"], flush=True)


if __name__ == "__main__":
    main()
