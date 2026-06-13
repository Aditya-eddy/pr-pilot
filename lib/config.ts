import "server-only";

import path from "node:path";
import { z } from "zod";

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  CODEX_MODEL: z.string().min(1).default("gpt-5.5"),
  CODEX_GITHUB_TOKEN: optionalSecret,
  CODEX_REASONING_EFFORT: z
    .enum(["low", "medium", "high", "xhigh"])
    .default("high"),
  CODEX_REVIEW_IMAGE: z
    .string()
    .min(1)
    .default("codex-pr-pilot-runner:local"),
  CODEX_STATUS_CACHE_TTL_SECONDS: positiveInteger(60),
  MAX_OPEN_PRS: positiveInteger(100),
  PR_CONTEXT_CACHE_TTL_SECONDS: positiveInteger(180),
  PR_CACHE_TTL_SECONDS: positiveInteger(300),
  PROMPT_REVIEW_PATH: z.string().min(1).default("prompt-review.md"),
  REDIS_URL: z.string().optional(),
  REVIEW_CONCURRENCY: positiveInteger(1),
  REVIEW_JOB_TTL_SECONDS: positiveInteger(86400),
  REVIEW_TIMEOUT_MS: positiveInteger(1_800_000),
});

const environment = environmentSchema.parse(process.env);

export const config = {
  ...environment,
  promptReviewPath: path.resolve(
    /* turbopackIgnore: true */
    process.cwd(),
    environment.PROMPT_REVIEW_PATH,
  ),
};
