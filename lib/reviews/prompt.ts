import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "@/lib/config";

const FALLBACK_PROMPT_NAMES = ["prompt-review.md", "prompt.md"];

export async function loadReviewPrompt(): Promise<{
  content: string;
  path: string;
}> {
  const candidates = [
    config.promptReviewPath,
    ...FALLBACK_PROMPT_NAMES.map((name) =>
      path.resolve(/* turbopackIgnore: true */ process.cwd(), name),
    ),
  ];

  for (const candidate of [...new Set(candidates)]) {
    try {
      const content = await readFile(candidate, "utf8");
      const includeMatch = content.match(
        /^\s*<!--\s*include:\s*(.+?)\s*-->\s*$/m,
      );

      if (includeMatch) {
        const includedPath = path.resolve(
          /* turbopackIgnore: true */
          path.dirname(candidate),
          includeMatch[1],
        );
        return {
          content: await readFile(includedPath, "utf8"),
          path: includedPath,
        };
      }

      return {
        content,
        path: candidate,
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    `Review prompt not found. Expected ${candidates.join(" or ")}`,
  );
}
