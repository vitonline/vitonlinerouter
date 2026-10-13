import { describe, it, expect, vi } from "vitest";
import { filterComboHealth } from "../../src/shared/utils/comboHealth";
import { handleComboChat } from "../../open-sse/services/combo";
const log = { info: vi.fn(), warn: vi.fn() };
describe("combo health eligibility", () => {
  const now = Date.now();
  const connection = { provider: "qwencloud", isActive: true };
  it("skips recent account failures but keeps untested models", () => {
    const result = filterComboHealth(["qw/blocked", "qw/new"], { connections: [connection], now, tests: { "qwencloud/blocked": { ok: false, reason: "Authentication rejection", testedAt: new Date(now).toISOString() } } });
    expect(result.eligible).toEqual(["qw/new"]);
    expect(result.skipped[0].reason).toBe("Authentication rejection");
  });
  it("accepts a second unlocked account and honors model-specific cooldowns", () => {
    const locked = { ...connection, modelLock_a: new Date(now + 60000).toISOString() };
    expect(filterComboHealth(["qw/a"], { connections: [locked], now }).eligible).toEqual([]);
    expect(filterComboHealth(["qw/a"], { connections: [locked, connection], now }).eligible).toEqual(["qw/a"]);
  });
  it("allows cleared cooldown verification and ages out temporary failures", () => {
    const tests = { "qwencloud/a": { ok: false, reason: "Request timed out", testedAt: new Date(now - 300001).toISOString() } };
    expect(filterComboHealth(["qw/a"], { connections: [connection], now, tests }).eligible).toEqual(["qw/a"]);
    tests["qwencloud/a"].testedAt = new Date(now).toISOString();
    expect(filterComboHealth(["qw/a"], { connections: [{ ...connection, verificationNeeded: true }], now, tests }).eligible).toEqual(["qw/a"]);
  });
});
describe("bounded fallback", () => {
  it("stops after the configured attempt budget", async () => {
    const attempt = vi.fn(async () => new Response('{"error":{"message":"unavailable"}}', { status: 401 }));
    const response = await handleComboChat({ body: {}, models: ["p/a", "p/b", "p/c", "p/d"], handleSingleModel: attempt, log, maxAttempts: 2 });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain("attempt limit");
  });
  it("aborts a hung attempt at the deadline and starts no further models", async () => {
    let aborted = false;
    const attempt = vi.fn((body, model, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { aborted = true; reject(options.signal.reason); })));
    const response = await handleComboChat({ body: {}, models: ["p/a", "p/b"], handleSingleModel: attempt, log, timeoutMs: 20 });
    expect(response.status).toBe(504);
    expect(aborted).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
  it("returns a successful streaming response without truncating its body", async () => {
    const result = new Response("stream payload");
    const response = await handleComboChat({ body: {}, models: ["p/a"], handleSingleModel: async () => result, log, timeoutMs: 100 });
    expect(await response.text()).toBe("stream payload");
  });
  it("does not start an upstream request after caller cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    const attempt = vi.fn();
    const response = await handleComboChat({ body: {}, models: ["p/a"], handleSingleModel: attempt, log, signal: controller.signal });
    expect(response.status).toBe(499); expect(attempt).not.toHaveBeenCalled();
  });
});
