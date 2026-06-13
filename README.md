# Codex PR Pilot

A local Woodpecker-inspired dashboard for listing pull requests authored by the
current `gh` user, starting a **Codex or Claude** review, and posting the result
as a native GitHub pull-request review. Pick the engine per request from the
dashboard or the trigger API.

## Requirements

- Node.js 24+
- Docker
- GitHub CLI authenticated with `gh auth login`
- For the Codex engine: Codex CLI authenticated with `codex login`
- For the Claude engine: Claude Code authenticated with `claude login`
  (or set `ANTHROPIC_API_KEY`)

Authenticate whichever engine(s) you intend to use; you do not need both.

The GitHub token needs access to the repositories being reviewed and permission
to create issue comments, pull-request reviews, and commit statuses.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5050`. The scripts bind to loopback intentionally.

The first review builds the `pr-pilot-runner:local` Docker image (it bundles
both the Codex and Claude CLIs). Build it ahead of time with:

```bash
npm run review-image
```

## Local trigger API

Inspect the endpoint contract:

```bash
curl http://127.0.0.1:5050/api/reviews
```

Trigger a review:

```bash
curl -X POST http://127.0.0.1:5050/api/reviews \
  -H 'Content-Type: application/json' \
  -d '{
    "repository": "owner/repository",
    "number": 123,
    "engine": "codex",
    "model": "gpt-5.5",
    "reasoningEffort": "high",
    "context": "Focus on concurrency and backward compatibility.",
    "refreshContext": false
  }'
```

The response contains a `job.id`. Poll it with:

```bash
curl http://127.0.0.1:5050/api/reviews/JOB_ID
```

`refreshContext` bypasses the PR-context cache. Use it only when a just-posted
comment or review must be visible immediately.

The dashboard reads the authenticated account's model catalog from Codex.
Requests are rejected when a model/reasoning combination is unavailable.

## Review engines

Each review runs with one engine, chosen per request (dashboard dropdown or the
`engine` field in the trigger API). Both run the same custom prompt inside the
same sandboxed container and emit the same structured JSON review.

- **Codex** (`engine: "codex"`) — runs `codex exec` with the model and reasoning
  effort from your Codex account's catalog (validated against `codex app-server`).
- **Claude** (`engine: "claude"`) — runs `claude --print --output-format
  stream-json --allow-dangerously-skip-permissions` with a Claude model
  (`opus`, `sonnet`, or `haiku`) and an `--effort` level. The container reuses
  the host's `claude login` credentials, or `ANTHROPIC_API_KEY` if set. `Edit`,
  `Write`, and `NotebookEdit` tools are disabled, and the PR checkout is mounted
  read-only, so Claude can inspect and clone dependencies but cannot modify the
  reviewed code.

Set the default engine and Claude default model with `REVIEW_ENGINE` and
`CLAUDE_MODEL`.

## Review workflow

1. Read the cached list of open PRs authored by the authenticated GitHub user.
2. Post a pending `codex/review` commit status and a short progress comment.
3. Fetch the PR description, discussion comments, reviews, inline comments,
   commit messages, changed files, and checks.
4. Check out the PR in a temporary directory.
5. Start a new ephemeral Codex session with the selected model and reasoning.
6. Run `codex exec review --dangerously-bypass-approvals-and-sandbox` inside a
   disposable Docker container.
7. Parse the structured result, validate each finding against the PR diff, and
   post one formal review with line-specific inline comments.
8. Keep only the summary, verdict, cross-repository checks, and findings that
   cannot be attached to a changed line in the top-level review body.
9. Mark the commit status successful.

Every trigger starts a new Codex session. The last five completed Codex outputs
are cached per PR and injected into subsequent runs. Posted GitHub reviews are
also part of the fetched PR context, so continuity survives local cache loss.

Triggering a review redirects to a live session page that streams Codex, Git,
GitHub, and worker activity. Active reviews are restored after a dashboard
reload, remain disabled to prevent duplicate runs, and link back to that page.

The dashboard displays the remaining percentage and reset time for the primary
and secondary Codex usage windows. The snapshot is cached for
`CODEX_STATUS_CACHE_TTL_SECONDS`.

## Custom prompt

`prompt-review.md` is the canonical prompt entry point. It currently includes
`prompt.md`, which contains the detailed staff-engineer review contract:

```md
<!-- include: prompt.md -->
```

Replace `prompt-review.md` with direct instructions at any time, or set
`PROMPT_REVIEW_PATH` to another file.

## Caching and GitHub rate limits

- Open-PR list: cached for `PR_CACHE_TTL_SECONDS` (default 5 minutes).
- Full PR context: cached for `PR_CONTEXT_CACHE_TTL_SECONDS` (default 3 minutes).
- Context collection: one `gh pr view` request plus one paginated inline-comment
  request per cache miss.
- Concurrent identical fetches are coalesced in-process.
- Set `REDIS_URL` to share cached data and job history across app instances.

The refresh button invalidates only the open-PR list. A review request uses the
context cache unless `refreshContext` is true.

## GitHub identity

By default, writes are attributed to the user authenticated in `gh`. Set
`CODEX_GITHUB_TOKEN` to use a separate write-only identity while retaining your
normal `gh` identity for listing and cloning repositories.

- A machine-user PAT posts as that machine user.
- A GitHub App installation token posts as `<app-slug>[bot]`.
- The token needs pull-request write permission. Progress comments also need
  issues write permission, and `codex/review` needs commit-status write
  permission.

GitHub App installation tokens expire after one hour, so refresh the environment
token before it expires or run the app under a token-refreshing supervisor.
OpenAI Codex does not provide a reusable GitHub bot identity or token.

## Security boundary

The requested `--dangerously-bypass-approvals-and-sandbox` flag is never run
directly on the host. It runs inside a disposable container with:

- a read-only PR checkout;
- all Linux capabilities dropped;
- `no-new-privileges`;
- CPU, memory, and process limits;
- no GitHub token or `gh` configuration;
- a temporary copy of Codex authentication removed after the job.

The container still needs network access for Codex and full-access mode can read
its temporary Codex credential. Review only trusted repositories and treat PR
text and code as untrusted input.

## Configuration

See `.env.example` for cache TTLs, review concurrency, timeout, model, reasoning
effort, prompt path, Redis, and Docker image settings.
