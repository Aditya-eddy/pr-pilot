---
name: pilot
description: Trigger a PR Pilot code review (Codex or Claude engine) on a GitHub pull request by calling the local PR Pilot API, then stream progress and report the posted GitHub review. Use when the user asks to review a PR with pilot, run a pilot or PR Pilot review, or invokes /pilot.
allowed-tools: Bash
---

# Pilot — run a PR Pilot review from anywhere

This skill drives the local **PR Pilot** app's review API. It does not
re-implement reviewing — it starts a real review job (Codex or Claude in a
sandboxed container, which posts a native GitHub pull-request review) and
reports the outcome. It is a personal skill, so `/pilot` works from any
directory.

## Prerequisites (check these first)

1. **The PR Pilot app must be running on this machine.** It serves the API at
   `http://127.0.0.1:5050`. If it isn't up, start it from the PR Pilot repo
   with `npm run dev`. Pass `--base-url` if it runs elsewhere. The helper
   script prints a clear error if it can't connect.
2. **`gh` is authenticated** (`gh auth status`) and the target PR is open and
   authored by the authenticated user — the API only lists the viewer's open
   PRs.

## How to run

Always invoke the bundled helper by its absolute path (so it works no matter
the current directory):

```bash
python3 "$HOME/.claude/skills/pilot/scripts/review.py" [options]
```

- **Inside a checked-out repo**: repo and PR number are auto-detected from `gh`,
  so you can run it with no arguments to review the current branch's PR.
- **Anywhere else** (the common case for a personal skill): there is no repo to
  detect from, so you MUST pass the target explicitly:

```bash
python3 "$HOME/.claude/skills/pilot/scripts/review.py" \
  --repository owner/repo --number 123 \
  --engine claude --model opus --reasoning high \
  --context "Focus on the new retry path and cross-repo API compatibility."
```

### Options

- `--repository owner/repo` — required when not inside a checked-out repo.
- `--number N` — required when not inside a checked-out repo.
- `--engine codex|claude` — defaults to `codex`.
- `--model <id>` — Codex model id, or `opus`/`sonnet`/`haiku` for Claude.
  Defaults to `gpt-5.5`.
- `--reasoning low|medium|high|xhigh` — defaults to `medium`.
- `--context "..."` — optional focus appended to the review prompt for this run.
- `--refresh-context` — bypass the PR-context cache.
- `--base-url <url>` — defaults to `http://127.0.0.1:5050`.
- `--timeout <seconds>` — give up waiting after this long (default 1800).

## What to do with the output

The script streams progress events (`[git]`, `[codex]`/`[claude]`, `[github]`,
`[system]`) as the job runs, then prints the final verdict/findings and the
GitHub review URL. Relay the verdict, the review link, and a short summary of
the findings. If the script exits non-zero, surface the failure reason it
printed (server not running, PR not found, or the engine error) instead of
retrying blindly.
