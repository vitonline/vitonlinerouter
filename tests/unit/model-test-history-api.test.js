import { beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getModelTests: vi.fn(), saveModelTest: vi.fn(), getProviderNodes: vi.fn(), pingModelByKind: vi.fn() }));
vi.mock("@/lib/db/repos/modelTestsRepo", () => ({ getModelTests: mocks.getModelTests, saveModelTest: mocks.saveModelTest }));
vi.mock("@/lib/db/repos/nodesRepo", () => ({ getProviderNodes: mocks.getProviderNodes }));
vi.mock("../../src/app/api/models/test/ping.js", () => ({ pingModelByKind: mocks.pingModelByKind }));
vi.mock("next/server", () => ({ NextResponse: { json: (body, options={}) => new Response(JSON.stringify(body), { status: options.status || 200 }) } }));
let GET, POST;
beforeAll(async () => {
  vi.doUnmock("../../open-sse/config/brand.js");
  vi.resetModules();
  ({ GET, POST } = await import("../../src/app/api/models/test/route.js"));
});
const node = { id: "openai-compatible-chat-test", prefix: "custom-test", name: "Custom test" };
beforeEach(() => { vi.clearAllMocks(); mocks.getProviderNodes.mockResolvedValue([node]); });
it("exposes custom-provider history and removes disallowed provider results", async () => {
  mocks.getModelTests.mockResolvedValue({ a: { model: "custom-test/org/model", ok: false, error: "[401]" }, b: { model: "qw/model", ok: true }, c: { model: "antigravity/model", ok: false } });
  const response = await GET();
  expect(response.status).toBe(200);
  const { results } = await response.json();
  expect(Object.keys(results)).toEqual(["custom-test/org/model", "qwencloud/model"]);
  expect(results["custom-test/org/model"]).toMatchObject({ providerId: node.id, reason: "Authentication rejection" });
});
it("passes custom-provider identity and verification details to persistence", async () => {
  const result = { ok: false, connectionAccepted: true, verification: "reasoning_only", note: "reasoning-only response" };
  mocks.pingModelByKind.mockResolvedValue(result);
  mocks.saveModelTest.mockResolvedValue(result);
  const response = await POST(new Request("http://localhost/api/models/test", { method: "POST", body: JSON.stringify({ model: "custom-test/org/model", kind: "llm" }) }));
  expect(response.status).toBe(200);
  expect(mocks.saveModelTest).toHaveBeenCalledWith("custom-test/org/model", "llm", result, [node]);
});
it("does not persist an aborted probe as a provider failure", async () => {
  const controller = new AbortController();
  controller.abort();
  mocks.pingModelByKind.mockResolvedValue({ ok: false, error: "aborted" });
  const response = await POST(new Request("http://localhost/api/models/test", { method: "POST", signal: controller.signal, body: JSON.stringify({ model: "custom-test/model" }) }));
  expect(response.status).toBe(499);
  expect(mocks.saveModelTest).not.toHaveBeenCalled();
});
it("rejects capability tests for non-chat models", async () => {
  const response = await POST(new Request("http://localhost/api/models/test", { method: "POST", body: JSON.stringify({ model: "test/model", kind: "stt", capability: "tools" }) }));
  expect(response.status).toBe(400);
  expect(mocks.pingModelByKind).not.toHaveBeenCalled();
});
