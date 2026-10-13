import { describe, it, expect, vi } from "vitest";
const { connections, usage } = vi.hoisted(() => ({ connections: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/localDb", () => ({ getProviderConnections: connections }));
vi.mock("@/app/api/usage/[connectionId]/route", () => ({ GET: usage }));
import { GET } from "../../src/app/api/models/account-allowances/route";
describe("account allowance summaries", () => {
  it("skips disabled and unsupported accounts and removes upstream secrets", async () => {
    connections.mockResolvedValue([
      { id: "off", provider: "codex", authType: "oauth", isActive: false },
      { id: "unsupported", provider: "custom-test", authType: "apikey" },
      { id: "on", provider: "codex", authType: "oauth", accessToken: "private-token" },
    ]);
    usage.mockResolvedValue(Response.json({ accessToken: "private-token", quotas: { weekly: { remaining: 20, total: 100, resetAt: "2026-10-13T00:00:00Z", private: "secret" } } }));
    const response = await GET(new Request("http://localhost/api/models/account-allowances"));
    const body = await response.json();
    expect(usage).toHaveBeenCalledTimes(1);
    expect(body.accounts[0].message).toContain("Disabled");
    expect(body.accounts[1].supported).toBe(false);
    expect(body.accounts[2].quotas.weekly.remaining).toBe(20);
    expect(JSON.stringify(body)).not.toContain("private-token");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
