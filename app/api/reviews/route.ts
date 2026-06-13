import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCodexStatus } from "@/lib/codex";
import { isSupportedCodexSelection } from "@/lib/codex-selection";
import { config } from "@/lib/config";
import { isSupportedClaudeSelection } from "@/lib/engines";
import { listOpenPullRequests } from "@/lib/pull-requests";
import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  context: z.string().max(50_000).optional(),
  engine: z.enum(["codex", "claude"]).optional().default(config.REVIEW_ENGINE),
  model: z.string().min(1).optional(),
  number: z.number().int().positive(),
  reasoningEffort: z
    .enum(["low", "medium", "high", "xhigh"])
    .optional()
    .default(config.CODEX_REASONING_EFFORT),
  refreshContext: z.boolean().optional().default(false),
  repository: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
});

export function GET(): NextResponse {
  return NextResponse.json({
    body: {
      context: "Optional request-specific review focus",
      engine: config.REVIEW_ENGINE,
      model:
        config.REVIEW_ENGINE === "claude"
          ? config.CLAUDE_MODEL
          : config.CODEX_MODEL,
      number: 123,
      reasoningEffort: config.CODEX_REASONING_EFFORT,
      refreshContext: false,
      repository: "owner/repository",
    },
    jobStatus: "GET /api/reviews/{jobId}",
    method: "POST",
    path: "/api/reviews",
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const input = requestSchema.parse(await request.json());
    const model =
      input.model ??
      (input.engine === "claude" ? config.CLAUDE_MODEL : config.CODEX_MODEL);
    const pullRequests = await listOpenPullRequests();
    const pullRequest = pullRequests.pullRequests.find(
      (candidate) =>
        candidate.repository === input.repository &&
        candidate.number === input.number,
    );

    if (!pullRequest) {
      return NextResponse.json(
        { error: "That pull request is not open or was not authored by you." },
        { status: 404 },
      );
    }

    if (input.engine === "claude") {
      if (!isSupportedClaudeSelection(model, input.reasoningEffort)) {
        return NextResponse.json(
          {
            error: `Claude model ${model} does not support ${input.reasoningEffort} effort.`,
          },
          { status: 400 },
        );
      }
    } else {
      const codexStatus = await getCodexStatus();
      if (
        !isSupportedCodexSelection(codexStatus, model, input.reasoningEffort)
      ) {
        return NextResponse.json(
          {
            error: `Model ${model} does not support ${input.reasoningEffort} reasoning for this Codex account.`,
          },
          { status: 400 },
        );
      }
    }

    const job = await getReviewQueue().enqueue(
      pullRequest,
      input.engine,
      model,
      input.reasoningEffort,
      input.context,
      input.refreshContext,
    );
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid pull request selection." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to start review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
