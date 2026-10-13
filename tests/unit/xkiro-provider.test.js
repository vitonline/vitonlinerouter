import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel, isFreeModel } from "../../open-sse/providers/pricing.js";
import { getExecutor } from "../../open-sse/executors/index.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { parseModel } from "../../open-sse/services/model.js";

const MODEL_ID = "qwen/qwen-plus-2025-07-28:free";

describe("xKiro provider", () => {
  const entry = REGISTRY.find((e) => e.id === "xkiro");

  it("is registered as an OpenAI-compatible apikey provider with a free tier", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("freeTier");
    expect(entry.authType).toBe("apikey");
    expect(entry.alias).toBe("xkiro");
    expect(entry.aliases).toContain("xk");
  });

  it("points at the verified OpenAI-compatible base URL", () => {
    expect(PROVIDERS.xkiro.baseUrl).toBe("https://api.xkiro.com/v1/chat/completions");
    expect(PROVIDERS.xkiro.validateUrl).toBe("https://api.xkiro.com/v1/models");
    // transport.format defaults to "openai" via the shared provider default
    expect(PROVIDERS.xkiro.format).toBe("openai");
  });

  it("declares no provider-wide thinkingFormat so each model resolves its own", () => {
    // xKiro forwards bodies verbatim. A provider-wide thinkingFormat
    // would override capabilities.js and force one wire format (e.g.
    // claude-adaptive) onto every model, which an OpenAI endpoint rejects.
    expect(PROVIDERS.xkiro.thinkingFormat).toBeUndefined();
  });

  it("seeds exactly the requested free model (no passthrough)", () => {
    expect(entry.passthroughModels).toBeUndefined();
    const ids = (PROVIDER_MODELS.xkiro || []).map((m) => m.id);
    expect(ids).toEqual([MODEL_ID]);
  });

  it("resolves the public catalog id back to the provider + upstream model", () => {
    // The catalog presents `${alias}/${modelId}`; the vendor-prefixed id must
    // survive parsing (first slash is the provider boundary).
    const parsed = parseModel(`xkiro/${MODEL_ID}`);
    expect(parsed.provider).toBe("xkiro");
    expect(parsed.model).toBe(MODEL_ID);
    expect(parseModel(`xk/${MODEL_ID}`).provider).toBe("xkiro");
  });

  it("routes through the shared DefaultExecutor (no custom adapter)", () => {
    expect(getExecutor("xkiro")).toBeInstanceOf(DefaultExecutor);
  });

  it("resolves capabilities from the live-reported limits (not the 1M pattern guess)", () => {
    // The generic *qwen*plus* pattern claims a 1M context window, but the live
    // /v1/models catalogue reports 131072 for this dated id — verified with a
    // real completion against the endpoint.
    const caps = getCapabilitiesForModel("xkiro", MODEL_ID);
    expect(caps).toMatchObject({
      vision: true,
      reasoning: true,
      thinkingFormat: "qwen",
      contextWindow: 131072,
      maxOutput: 65536,
    });
  });

  it("bills the :free model at $0 in usage tracking", () => {
    expect(isFreeModel(MODEL_ID)).toBe(true);
    expect(getPricingForModel("xkiro", MODEL_ID)).toMatchObject({
      input: 0,
      output: 0,
    });
  });

  it("keeps every registry id unique after adding xkiro", () => {
    const ids = REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
