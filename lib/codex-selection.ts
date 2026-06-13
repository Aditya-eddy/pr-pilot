import type { CodexStatus, ReasoningEffort } from "@/lib/types";

export function isSupportedCodexSelection(
  status: CodexStatus,
  modelId: string,
  reasoningEffort: ReasoningEffort,
): boolean {
  return status.models.some(
    (model) =>
      model.id === modelId &&
      model.reasoningEfforts.some(
        (effort) => effort.value === reasoningEffort,
      ),
  );
}
