import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqlJsAdapter } from "../../src/lib/db/adapters/sqlJsAdapter";
const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../src/lib/db/driver", () => ({ getAdapter: async () => state.db }));
import { traceComboRouting } from "../../src/shared/services/routingTrace";
let directory;
afterEach(() => { state.db?.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
async function setup() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "routing-trace-"));
  state.db = await createSqlJsAdapter(path.join(directory, "test.sqlite"));
  state.db.exec("CREATE TABLE kv(scope TEXT,key TEXT,value TEXT,PRIMARY KEY(scope,key))");
}
it("records failed model attempts and actual upstream selection without request content", async () => {
  await setup();
  const response = await traceComboRouting(async options => {
    await options.handleSingleModel(options.body, "first/model");
    return options.handleSingleModel(options.body, "public/alias");
  }, { body: { apiKey: "private-key", messages: [{ content: "private-prompt" }] }, comboName: "Pilot", handleSingleModel: async (_body, model) => model.startsWith("first/") ? new Response("failure", { status: 503 }) : new Response("OK", { headers: { "x-vr-upstream-model": "actual/model" } }) });
  expect(response.headers.get("x-vr-selected-model")).toBe("actual/model");
  expect(response.headers.get("x-vr-model-attempts")).toBe("2");
  const value = state.db.get("SELECT value FROM kv WHERE scope = 'routingTraces'").value;
  expect(value).not.toMatch(/private-key|private-prompt/);
  const record = JSON.parse(value);
  expect(record.attempts.map(attempt => attempt.status)).toEqual([503, 200]);
  expect(record.selectedModel).toBe("actual/model");
  expect(await response.text()).toBe("OK");
});
it("does not persist upstream exception text that might echo a conversation", async () => {
  await setup();
  await traceComboRouting(async options => {
    try { await options.handleSingleModel({}, "provider/model"); } catch { return new Response("failed", { status: 503 }); }
  }, { comboName: "Pilot", handleSingleModel: async () => { throw new Error("private-prompt and private-key"); } });
  const value = state.db.get("SELECT value FROM kv WHERE scope = 'routingTraces'").value;
  expect(value).not.toMatch(/private-prompt|private-key/);
  expect(JSON.parse(value).attempts[0].error).toBe("Error");
});
async function tracedStream(stream) {
  await setup();
  return traceComboRouting(options => options.handleSingleModel({}, "provider/model"), { comboName: "Pilot", handleSingleModel: async () => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }) });
}
function stored() { return JSON.parse(state.db.get("SELECT value FROM kv WHERE scope = 'routingTraces'").value); }
it("updates a streamed route after completion rather than treating headers as completion", async () => {
  const response = await tracedStream(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("data: OK\n\n")); controller.close(); } }));
  expect(stored().streamStatus).toBe("in_progress");
  expect(await response.text()).toContain("OK");
  expect(stored().streamStatus).toBe("completed");
  expect(stored().streamDurationMs).toBeGreaterThanOrEqual(stored().latencyMs);
});
it("propagates caller cancellation upstream and records it without the cancellation reason", async () => {
  const cancel = vi.fn();
  const response = await tracedStream(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel }));
  const reader = response.body.getReader(); await reader.read(); await reader.cancel("private-prompt");
  expect(cancel).toHaveBeenCalledOnce();
  expect(stored().streamStatus).toBe("cancelled");
  expect(JSON.stringify(stored())).not.toContain("private-prompt");
});
it("records stream transport failure without leaking its exception text", async () => {
  let streamController;
  const response = await tracedStream(new ReadableStream({ start(controller) { streamController = controller; } }));
  const read = response.body.getReader().read();
  streamController.error(new Error("private-prompt"));
  await expect(read).rejects.toThrow("private-prompt");
  expect(stored().streamStatus).toBe("failed");
  expect(stored().streamError).toBe("Error");
});
