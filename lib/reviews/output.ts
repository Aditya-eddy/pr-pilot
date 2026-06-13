import { z } from "zod";

export const reviewFindingSchema = z.object({
  body: z.string().min(1),
  line: z.number().int().positive().nullable(),
  path: z.string().min(1).nullable(),
  severity: z.enum(["Blocker", "Major", "Minor", "Nit"]),
  side: z.enum(["LEFT", "RIGHT"]).nullable(),
  title: z.string().min(1),
});

export const reviewOutputSchema = z.object({
  crossRepositoryChecks: z.string().min(1),
  findings: z.array(reviewFindingSchema).max(50),
  nitsAndLint: z.array(z.string()),
  summary: z.string().min(1),
  verdict: z.enum([
    "Approve",
    "Approve with comments",
    "Request changes",
  ]),
  verdictReason: z.string().min(1),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export interface ChangedDiffLines {
  left: Set<number>;
  right: Set<number>;
}

export function parseReviewOutput(raw: string): ReviewOutput {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");

  if (start === -1 || end < start) {
    throw new Error("Codex review output did not contain a JSON object");
  }

  return reviewOutputSchema.parse(
    JSON.parse(unfenced.slice(start, end + 1)),
  );
}

export function parseChangedDiffLines(diff: string): ChangedDiffLines {
  const changed: ChangedDiffLines = {
    left: new Set<number>(),
    right: new Set<number>(),
  };
  let oldLine: number | null = null;
  let newLine: number | null = null;

  for (const line of diff.split("\n")) {
    const hunk = line.match(
      /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/,
    );
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }

    if (oldLine === null || newLine === null) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changed.right.add(newLine);
      newLine += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      changed.left.add(oldLine);
      oldLine += 1;
    } else if (line.startsWith(" ")) {
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith("diff --git")) {
      oldLine = null;
      newLine = null;
    }
  }

  return changed;
}

export function renderInlineFinding(finding: ReviewFinding): string {
  return [
    `**${finding.severity} — ${finding.title}**`,
    "",
    finding.body.trim(),
  ].join("\n");
}

function renderFinding(finding: ReviewFinding): string {
  const location =
    finding.path && finding.line
      ? `\`${finding.path}:${finding.line}\``
      : "_No attachable diff line._";

  return [
    `### ${finding.severity} — ${finding.title}`,
    `- **Where:** ${location}`,
    `- **Comment:** ${finding.body.trim()}`,
  ].join("\n");
}

export function renderReviewOutput(
  output: ReviewOutput,
  findings: ReviewFinding[] = output.findings,
): string {
  const sections = [
    "## Summary",
    output.summary.trim(),
    "",
    "## Verdict",
    `${output.verdict} — ${output.verdictReason.trim()}`,
  ];

  if (findings.length > 0) {
    sections.push(
      "",
      "## Findings not attached inline",
      "",
      findings.map(renderFinding).join("\n\n"),
    );
  }

  sections.push(
    "",
    "## Cross-repository checks",
    output.crossRepositoryChecks.trim(),
    "",
    "## Nits & lint",
    output.nitsAndLint.length > 0
      ? output.nitsAndLint.map((nit) => `- ${nit}`).join("\n")
      : "No additional lint or formatting issues found.",
  );

  return sections.join("\n");
}

export function renderReviewHistory(output: ReviewOutput): string {
  const sections = [
    "## Summary",
    output.summary.trim(),
    "",
    "## Verdict",
    `${output.verdict} — ${output.verdictReason.trim()}`,
  ];

  if (output.findings.length > 0) {
    sections.push(
      "",
      "## Findings",
      "",
      output.findings.map(renderFinding).join("\n\n"),
    );
  } else {
    sections.push("", "## Findings", "No substantive findings.");
  }

  sections.push(
    "",
    "## Cross-repository checks",
    output.crossRepositoryChecks.trim(),
    "",
    "## Nits & lint",
    output.nitsAndLint.length > 0
      ? output.nitsAndLint.map((nit) => `- ${nit}`).join("\n")
      : "No additional lint or formatting issues found.",
  );

  return sections.join("\n");
}
