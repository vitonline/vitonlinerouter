import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqlJsAdapter } from "../../src/lib/db/adapters/sqlJsAdapter";
const state = vi.hoisted(() => ({ db: null, config: null, pricing: { input: 1, output: 1 } }));
vi.mock("../../src/lib/db/driver", () => ({ getAdapter: async () => state.db }));
vi.mock("../../src/lib/db/repos/settingsRepo", () => ({ getSettings: async () => ({ spendControl: state.config }) }));
vi.mock("../../src/lib/db/repos/pricingRepo", () => ({ getPricingForModel: async () => state.pricing }));
import { reserveSpend, settleSpend, getSpendControlState } from "../../src/lib/db/repos/spendControl";
import { configurationExport } from "../../src/shared/utils/configurationExport";
import { selectVerifiedModels } from "../../src/shared/services/recommendedModels";
import { calculateCostFromTokens } from "../../open-sse/providers/pricing";
let directory;
afterEach(() => { state.db?.close(); state.db = null; if (directory) fs.rmSync(directory, { recursive: true, force: true }); state.pricing = { input: 1, output: 1 }; });
async function setup() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-budget-"));
  state.db = await createSqlJsAdapter(path.join(directory, "test.sqlite"));
  state.db.exec("CREATE TABLE kv(scope TEXT,key TEXT,value TEXT,PRIMARY KEY(scope,key))");
  state.config = { enabled: true, dailyLimitUsd: 0.03, maxOutputTokens: 100 };
}
describe("pilot readiness controls", () => {
  it("atomically reserves concurrent requests without exceeding admission budget", async () => {
    await setup();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => reserveSpend("p", "model", { messages: [{ role: "user", content: "hello" }] })));
    expect(results.some(r => r.status === "rejected")).toBe(true);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    expect((await getSpendControlState()).reservedOrSettledUsd).toBeLessThanOrEqual(0.03);
  });
  it("retains interrupted stream reservation and settles completed usage exactly once", async () => {
    await setup();
    const reserved = await reserveSpend("p", "model", {});
    expect((await getSpendControlState()).pendingReservations).toBe(1);
    await settleSpend(reserved.id, { prompt_tokens: 10, completion_tokens: 10 });
    await settleSpend(reserved.id, { prompt_tokens: 1000000, completion_tokens: 10 });
    expect((await getSpendControlState()).pendingReservations).toBe(0);
    expect((await getSpendControlState()).reservedOrSettledUsd).toBeCloseTo(0.00002);
  });
  it("blocks unknown prices and enforces output cap", async () => {
    await setup(); state.pricing = null;
    await expect(reserveSpend("p", "unknown", {})).rejects.toThrow("unknown");
    state.pricing = { input: 1, output: 1 };
    const reserved = await reserveSpend("p", "model", { max_tokens: 5000 });
    expect(reserved.body.max_tokens).toBe(100);
  });
  it("excludes stale and incomplete models from the paid pool", () => {
    const fresh = new Date().toISOString();
    const record = model => ({ model, capabilities: Object.fromEntries(["text", "streaming", "tools", "json"].map(cap => [cap, { ok: true, testedAt: fresh }])) });
    const good = record("p/good"), bad = record("p/bad"), stale = record("p/stale");
    bad.capabilities.tools.ok = false; stale.capabilities.json.testedAt = "2020-01-01";
    expect(selectVerifiedModels({ good, bad, stale })).toEqual(["p/good"]);
  });
  it("exports configuration without authentication material or proxy passwords", () => {
    const payload = configurationExport({ settings: { password: "hash", oidcClientSecret: "secret", requireLogin: false }, apiKeys: [{ key: "sk-private" }], providerConnections: [{ id: "p", apiKey: "sk-private", refreshToken: "opaque", isActive: true, providerSpecificData: { proxyUrl: "https://user:pass@example.com" } }] });
    expect(JSON.stringify(payload)).not.toMatch(/sk-private|opaque|hash|user:pass|secret/);
    expect(payload.providerConnections[0].isActive).toBe(false);
    expect(payload.apiKeys).toEqual([]);
    expect(payload.settings.requireLogin).toBe(true);
  });
  it("preserves explicit free cache rates", () => {
    expect(calculateCostFromTokens({ prompt_tokens: 100, cached_tokens: 100, completion_tokens: 0 }, { input: 10, output: 10, cached: 0 })).toBe(0);
  });
  it("preserves token limits while removing authentication tokens from exports", () => {
    const exported = configurationExport({ settings: { spendControl: { enabled: true, dailyLimitUsd: 10, maxOutputTokens: 1024 }, accessToken: "private-access", tailscaleAuthKey: "private-auth" } });
    expect(exported.settings.spendControl.maxOutputTokens).toBe(1024);
    expect(JSON.stringify(exported)).not.toMatch(/private-access|private-auth/);
  });
});
