import { describe, expect, it } from "vitest";

import { isSupportedCodexSelection } from "@/lib/codex-selection";
import type { CodexStatus } from "@/lib/types";

const status: CodexStatus = {
  credits: null,
  fetchedAt: "2026-06-13T12:00:00Z",
  models: [
    {
      defaultReasoningEffort: "medium",
      description: "Test model",
      displayName: "GPT Test",
      id: "gpt-test",
      isDefault: true,
      reasoningEfforts: [
        { description: "Fast", value: "low" },
        { description: "Deep", value: "high" },
      ],
    },
  ],
  planType: "plus",
  primary: null,
  rateLimitReachedType: null,
  secondary: null,
};

describe("isSupportedCodexSelection", () => {
  it("accepts an available model and reasoning pair", () => {
    expect(isSupportedCodexSelection(status, "gpt-test", "high")).toBe(true);
  });

  it("rejects unavailable models and reasoning levels", () => {
    expect(isSupportedCodexSelection(status, "gpt-missing", "high")).toBe(
      false,
    );
    expect(isSupportedCodexSelection(status, "gpt-test", "xhigh")).toBe(false);
  });
});
