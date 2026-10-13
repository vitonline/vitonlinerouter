import { describe, it, expect, vi, afterEach } from "vitest";
import { handleFusionChat } from "../../open-sse/services/combo.js";
import { checkApiRequestLimit, __test__ } from "../../src/lib/auth/apiLimiter.js";
const log = { info() {}, warn() {} };
const answer = text => Response.json({ choices: [{ message: { content: text } }] });
afterEach(() => { vi.unstubAllEnvs(); __test__.reset(); });
describe("audit routing safety", () => {
  it("isolates nested panel input and reuses the survivor for streaming", async () => {
    const body = { stream: true, messages: [{ role: "user", content: "original" }] };
    const seen = [];
    const run = vi.fn(async (input, model) => {
      seen.push(input.messages[0].content);
      input.messages[0].content = model;
      return model === "p/good" ? answer("cached answer") : new Response(null, { status: 500 });
    });
    const res = await handleFusionChat({ body, models: ["p/good", "p/bad"], handleSingleModel: run, log });
    expect(seen).toEqual(["original", "original"]);
    expect(body.messages[0].content).toBe("original");
    expect(run).toHaveBeenCalledTimes(2);
    expect(await res.text()).toContain("cached answer");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });
  it("aborts stragglers when quorum collection ends", async () => {
    let slowSignal;
    const run = async (_body, model, _panel, options) => {
      if (model !== "p/slow") return answer(model);
      slowSignal = options.signal;
      return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    };
    await handleFusionChat({ body: {}, models: ["p/a", "p/b", "p/slow"], handleSingleModel: run, log,
      tuning: { stragglerGraceMs: 5, panelHardTimeoutMs: 200 } });
    expect(slowSignal.aborted).toBe(true);
  });
  it("limits each credential and also shared peer capacity", () => {
    vi.stubEnv("API_REQUESTS_PER_MINUTE", "2");
    expect(checkApiRequestLimit("fixture-a", "peer").allowed).toBe(true);
    expect(checkApiRequestLimit("fixture-a", "peer").allowed).toBe(true);
    expect(checkApiRequestLimit("fixture-a", "peer")).toEqual({ allowed: false, retryAfter: 60 });
    expect(checkApiRequestLimit("fixture-b", "peer").allowed).toBe(true);
  });
});
