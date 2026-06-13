import type {
  CodexModelOption,
  Engine,
  ReasoningEffort,
} from "@/lib/types";

export const ENGINES: Engine[] = ["codex", "claude"];

export function engineLabel(engine: Engine): string {
  return engine === "claude" ? "Claude" : "Codex";
}

// Claude exposes the same effort levels Codex does (it also accepts "max",
// which we intentionally omit to keep one shared ReasoningEffort union).
const CLAUDE_REASONING_EFFORTS: Array<{
  description: string;
  value: ReasoningEffort;
}> = [
  { description: "Fastest, least thorough", value: "low" },
  { description: "Balanced speed and depth", value: "medium" },
  { description: "Deeper reasoning (recommended)", value: "high" },
  { description: "Most thorough, slowest", value: "xhigh" },
];

// Static catalog for the Claude engine. The `id` is the alias passed to
// `claude --model`, which always resolves to the latest build of that model.
export const CLAUDE_MODELS: CodexModelOption[] = [
  {
    defaultReasoningEffort: "high",
    description: "Most capable; best for deep, cross-repository reviews.",
    displayName: "Claude Opus 4.8",
    id: "opus",
    isDefault: true,
    reasoningEfforts: CLAUDE_REASONING_EFFORTS,
  },
  {
    defaultReasoningEffort: "high",
    description: "Fast and capable; a good default for most pull requests.",
    displayName: "Claude Sonnet 4.6",
    id: "sonnet",
    isDefault: false,
    reasoningEfforts: CLAUDE_REASONING_EFFORTS,
  },
  {
    defaultReasoningEffort: "medium",
    description: "Fastest; lightweight checks on small diffs.",
    displayName: "Claude Haiku 4.5",
    id: "haiku",
    isDefault: false,
    reasoningEfforts: CLAUDE_REASONING_EFFORTS,
  },
];

export function isSupportedClaudeSelection(
  modelId: string,
  reasoningEffort: ReasoningEffort,
): boolean {
  return CLAUDE_MODELS.some(
    (model) =>
      model.id === modelId &&
      model.reasoningEfforts.some(
        (effort) => effort.value === reasoningEffort,
      ),
  );
}
