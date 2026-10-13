import { it, expect, vi, afterEach } from "vitest";
import { runBulkModelTests } from "../../src/shared/utils/bulkModelTests";
import { summarizeTestHistory } from "../../src/shared/utils/modelTestHistory";
vi.mock("../../src/app/api/models/test/ping", () => ({ getInternalHeaders: async () => ({}) }));
import { pingCapability } from "../../src/app/api/models/test/capabilities";
import { readProbeAsset } from "../../src/app/api/models/test/probeAssets";
afterEach(() => vi.unstubAllGlobals());
it("bundles a real non-silent WAV sample", async () => {
  const wav = await readProbeAsset("transcription-probe.wav");
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  const dataOffset = wav.indexOf(Buffer.from("data"));
  const dataLength = wav.readUInt32LE(dataOffset + 4);
  expect(dataLength).toBeGreaterThan(16000);
  expect(wav.subarray(dataOffset + 8, dataOffset + 8 + dataLength).some(byte => byte !== 0)).toBe(true);
});

it("bounds concurrency, deduplicates models, and continues after one failure", async () => {
  let active = 0, peak = 0;
  const progress = await runBulkModelTests([{ model: "a" }, { model: "a" }, { model: "b" }, { model: "c" }], {
    test: async item => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; if (item.model === "b") throw new Error("write failed"); return { ok: true }; },
  });
  expect(peak).toBe(2);
  expect(progress).toMatchObject({ total: 3, completed: 3, passed: 2, failed: 1 });
});
it("stops queued tests and does not count an aborted test as a model failure", async () => {
  const controller = new AbortController();
  const test = vi.fn(async () => { controller.abort(); throw new Error("aborted"); });
  const progress = await runBulkModelTests([{ model: "a" }, { model: "b" }], { test, signal: controller.signal, concurrency: 1 });
  expect(test).toHaveBeenCalledTimes(1);
  expect(progress).toMatchObject({ completed: 0, failed: 0, cancelled: true });
});
it("reports freshness and latency from actual attempts", () => {
  const summary = summarizeTestHistory([{ ok: false, latencyMs: 100, testedAt: "2026-10-10T00:00:00Z" }, { ok: true, latencyMs: 200, testedAt: "2026-10-10T01:00:00Z" }], Date.parse("2026-10-12T00:00:00Z"));
  expect(summary).toMatchObject({ attempts: 2, successRate: 50, averageLatencyMs: 150, latencyTrend: "slower", stale: true });
});
it.each([
  ["json", { content: '{"probe":"READY"}' }, true],
  ["json", { content: 'READY' }, false],
  ["tools", { content: 'READY' }, false],
  ["tools", { tool_calls: [{ function: { name: "health_probe", arguments: '{"probe":"READY"}' } }] }, true],
  ["vision", { content: "red" }, true],
  ["vision", { content: "blue" }, false],
  ["reasoning", { content: "6" }, false],
  ["reasoning", { content: "6", reasoning_content: "3 times 2" }, true],
])("verifies %s response shape", async (capability, message, ok) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 })));
  expect((await pingCapability("test/model", capability)).ok).toBe(ok);
});
it.each([true, false])("requires complete streaming output (%s)", async complete => {
  const raw = 'data: {"choices":[{"delta":{"content":"READY"}}]}\n\n' + (complete ? 'data: [DONE]\n\n' : '');
  vi.stubGlobal("fetch", vi.fn(async () => new Response(raw, { headers: { "Content-Type": "text/event-stream" } })));
  expect((await pingCapability("test/model", "streaming")).ok).toBe(complete);
});
