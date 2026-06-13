import { describe, expect, it } from "vitest";

import { CLAUDE_MODELS, isSupportedClaudeSelection } from "@/lib/engines";

describe("isSupportedClaudeSelection", () => {
  it("accepts a known Claude model and effort", () => {
    expect(isSupportedClaudeSelection("opus", "high")).toBe(true);
    expect(isSupportedClaudeSelection("sonnet", "low")).toBe(true);
  });

  it("rejects unknown models", () => {
    expect(isSupportedClaudeSelection("gpt-5.5", "high")).toBe(false);
  });

  it("exposes a single default model", () => {
    expect(CLAUDE_MODELS.filter((model) => model.isDefault)).toHaveLength(1);
  });
});
