import { describe, it, expect } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { parseModel } from "../../open-sse/services/model.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

describe("dashboard provider alias routing", () => {
  it("routes qw to QwenCloud's endpoint rather than the OpenAI fallback", () => {
    const parsed = parseModel("qw/qwen3.6-plus");
    expect(parsed.provider).toBe("qwencloud");
    const executor = new DefaultExecutor(parsed.provider);
    expect(executor.buildUrl(parsed.model, false)).toBe("https://maas.qwencloudapi.com/compatible-mode/v1/chat/completions");
    expect(executor.buildHeaders({ apiKey: "test-key" }, false).Authorization).toBe("Bearer test-key");
  });
  it.each(REGISTRY.filter((entry) => entry.uiAlias && entry.uiAlias !== entry.alias).map((entry) => [entry.uiAlias, entry.id]))("resolves UI alias %s to %s", (alias, provider) => {
    expect(parseModel(`${alias}/test-model`).provider).toBe(provider);
  });
});
