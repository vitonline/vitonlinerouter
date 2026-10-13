import { describe, it, expect } from "vitest";
import { modelTestResult, modelTestReason } from "../../src/shared/utils/modelTestResult.js";

describe("model test failure reasons", () => {
  it.each([
    ["HTTP 503: [qw/model] [401]: Incorrect API key provided", 503, "Authentication rejection"],
    ["You've used this period's free allowance", 429, "Free allowance exhausted"],
    ["You have reached the maximum Free Tier request limit", 403, "Free allowance exhausted"],
    ["model_requires_purchase: locked until you make a purchase", 429, "Credits or plan restrictions"],
    ["This model cannot use your gift balance", 403, "Credits or plan restrictions"],
    ["Free models share site-wide capacity and it is currently full", 429, "Upstream overload"],
    ["UnsupportedModel: does not support the coding plan feature", 404, "Model incompatible with CodingPlan"],
    ['HTTP 503: [byteplus/dola-seed-2-1-turbo-260628] [404]: {"error":{"code":"UnsupportedModel","message":"The requested model does not support the coding plan feature."}}', 503, "Model incompatible with CodingPlan"],
    ["Global rate limit exceeded", 429, "Rate limit reached"],
    ["Network error: Failed to fetch", undefined, "Connection error"],
    ["The operation timed out", undefined, "Request timed out"],
    ["Unexpected response", 200, "Test failed"],
    ["HTTP 503 [402]: Daily check-in required; billing_error", 503, "Daily check-in required"],
    ["InvalidSubscription: no valid CodingPlan subscription", 400, "Expired or missing CodingPlan subscription"],
    ["HTTP 503 [403]: only available on agentic harnesses", 503, "Model requires agentic harness"],
    ["HTTP 404: No active credentials for provider: google-tts", 404, "No active connection"],
    ["free_tier_limit_exceeded: Top-up saldo", 503, "Free allowance exhausted"],
    ["HTTP 503 [403]: WebShield blocked category malicious_url", 503, "Security software blocked upstream"],
    ["HTTP 503 [403]: restricted model", 503, "Access restricted"],
    ["HTTP 503 [404]: Model 'gpt-6-sol' not found", 503, "Model unsupported or unavailable"],
  ])("classifies %s", (error, status, reason) => {
    expect(modelTestReason(error, status)).toBe(reason);
  });

  it("redacts echoed credentials while retaining the reason and latency", () => {
    const result = modelTestResult({ ok: false, status: 503, latencyMs: 50, error: "[401]: Incorrect API key provided: sk-ws-secret.value" });
    expect(result.reason).toBe("Authentication rejection");
    expect(result.error).not.toContain("sk-ws-secret");
    expect(result.latencyMs).toBe(50);
  });

  it("marks a successful retest as passed", () => {
    expect(modelTestResult({ ok: true, latencyMs: 10 }).reason).toBe("Test passed");
  });
});
