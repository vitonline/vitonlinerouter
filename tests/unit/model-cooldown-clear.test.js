import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ getProviderConnections: vi.fn(), updateProviderConnection: vi.fn() }));
vi.mock("@/lib/localDb", () => mocks);
vi.mock("next/server", () => ({ NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status || 200 }) } }));
const { POST } = await import("../../src/app/api/models/availability/route.js");

describe("provider cooldown reset", () => {
  beforeEach(() => vi.clearAllMocks());
  it("clears all model and account locks only for the requested provider", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      { id: "a", modelLock_first: "future", modelLock_second: "future", rateLimitedUntil: "future", testStatus: "unavailable" },
      { id: "b", rateLimitedUntil: "future", testStatus: "unavailable" },
    ]);
    const res = await POST(new Request("http://localhost/api/models/availability", {
      method: "POST", body: JSON.stringify({ action: "clearCooldown", provider: "qwencloud", model: "__all" }),
    }));
    expect(res.status).toBe(200);
    expect(mocks.getProviderConnections).toHaveBeenCalledWith({ provider: "qwencloud" });
    expect(mocks.updateProviderConnection).toHaveBeenCalledWith("a", expect.objectContaining({ modelLock_first: null, modelLock_second: null, rateLimitedUntil: null, errorCode: null, testStatus: "unknown", verificationNeeded: true }));
    expect(mocks.updateProviderConnection).toHaveBeenCalledWith("b", expect.objectContaining({ rateLimitedUntil: null }));
  });
  it("keeps unrelated model locks for a single-model reset", async () => {
    mocks.getProviderConnections.mockResolvedValue([{ id: "a", modelLock_first: "future", modelLock_second: "future" }]);
    await POST(new Request("http://localhost/api/models/availability", {
      method: "POST", body: JSON.stringify({ action: "clearCooldown", provider: "other", model: "first" }),
    }));
    const update = mocks.updateProviderConnection.mock.calls[0][1];
    expect(update.modelLock_first).toBeNull();
    expect(update).not.toHaveProperty("modelLock_second");
    expect(update.testStatus).toBe("unknown");
    expect(update).not.toHaveProperty("lastError");
  });
});
