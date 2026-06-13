import { describe, expect, it } from "vitest";

import {
  parseChangedDiffLines,
  parseReviewOutput,
  renderReviewOutput,
} from "@/lib/reviews/output";

const rawOutput = JSON.stringify({
  crossRepositoryChecks: "No external repositories were required.",
  findings: [
    {
      body: "The request can hang. Add `--max-time 3`.",
      line: 65,
      path: ".woodpecker/test.yml",
      severity: "Major",
      side: "RIGHT",
      title: "Readiness probe has no timeout",
    },
  ],
  nitsAndLint: [],
  summary: "This PR adds readiness polling before tests.",
  verdict: "Request changes",
  verdictReason: "Bound each request before merging.",
});

describe("parseReviewOutput", () => {
  it("parses structured Codex output with optional JSON fences", () => {
    expect(parseReviewOutput(`\`\`\`json\n${rawOutput}\n\`\`\``)).toMatchObject(
      {
        findings: [
          {
            line: 65,
            path: ".woodpecker/test.yml",
            side: "RIGHT",
          },
        ],
        verdict: "Request changes",
      },
    );
  });

  it("renders inline findings only when explicitly requested", () => {
    const output = parseReviewOutput(rawOutput);
    const summaryOnly = renderReviewOutput(output, []);
    const fallback = renderReviewOutput(output);

    expect(summaryOnly).not.toContain("Readiness probe has no timeout");
    expect(fallback).toContain("Findings not attached inline");
    expect(fallback).toContain("`.woodpecker/test.yml:65`");
  });
});

describe("parseChangedDiffLines", () => {
  it("tracks new and old line numbers from zero-context hunks", () => {
    const changed = parseChangedDiffLines([
      "@@ -10,2 +10,3 @@",
      "-old first",
      "-old second",
      "+new first",
      "+new second",
      "+new third",
      "@@ -30 +31 @@",
      "-removed",
      "+replacement",
    ].join("\n"));

    expect([...changed.left]).toEqual([10, 11, 30]);
    expect([...changed.right]).toEqual([10, 11, 12, 31]);
  });
});
