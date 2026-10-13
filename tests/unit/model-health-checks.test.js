import { describe, it, expect, vi } from "vitest";
import { validateHealthCheckConfig } from "../../src/shared/utils/healthCheckConfig";
import { runModelHealthCheckTick } from "../../src/shared/services/modelHealthChecks";
const config = { enabled: true, models: ["qw/a", "qw/b"], intervalMinutes: 5, requestsPerHour: 1 };
function fixture(active = true, saved = {}) {
  const settings = { modelHealthChecks: config, modelHealthCheckState: saved };
  return {
    getSettings: vi.fn(async () => settings),
    updateSettings: vi.fn(async patch => Object.assign(settings, structuredClone(patch))),
    getProviderConnections: vi.fn(async () => [{ provider: "qwencloud", isActive: active }]),
    getProviderNodes: vi.fn(async () => []),
    getModelTests: vi.fn(async () => ({ "qw/a": { ok: false, reason: "Authentication rejection" } })),
    pingModelByKind: vi.fn(async () => ({ ok: true })),
    saveModelTest: vi.fn(async () => ({ ok: true })),
  };
}
describe("scheduled model health checks", () => {
  it("rejects unbounded or malformed schedules", () => {
    expect(() => validateHealthCheckConfig({ ...config, requestsPerHour: 61 })).toThrow();
    expect(() => validateHealthCheckConfig({ ...config, intervalMinutes: 0 })).toThrow();
    expect(() => validateHealthCheckConfig({ ...config, models: ["bad"] })).toThrow();
  });
  it("reserves persistent budget and records only status transitions", async () => {
    const deps = fixture(); const runtime = { running: false };
    await runModelHealthCheckTick(deps, runtime);
    expect(deps.pingModelByKind).toHaveBeenCalledTimes(1);
    const state = (await deps.getSettings()).modelHealthCheckState;
    expect(state.requests).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ previous: "Authentication rejection", status: "Ready" });
    state.lastRunAt = 0;
    await runModelHealthCheckTick(deps, { running: false });
    expect(deps.pingModelByKind).toHaveBeenCalledTimes(1);
  });
  it("never tests disabled connections", async () => {
    const deps = fixture(false); await runModelHealthCheckTick(deps, { running: false });
    expect(deps.pingModelByKind).not.toHaveBeenCalled();
  });
  it("does not notify for unchanged status or initial baseline", async () => {
    const deps = fixture(true, { statuses: { "qw/a": "Ready" } });
    await runModelHealthCheckTick(deps, { running: false });
    expect((await deps.getSettings()).modelHealthCheckState.events).toHaveLength(0);
  });
  it("avoids overlap", async () => {
    const deps = fixture(); await runModelHealthCheckTick(deps, { running: true });
    expect(deps.getSettings).not.toHaveBeenCalled();
  });
  it("rotates model selection once old budget entries expire", async () => {
    const deps = fixture(true, { cursor: 1, requests: [Date.now() - 3600001] });
    await runModelHealthCheckTick(deps, { running: false });
    expect(deps.pingModelByKind).toHaveBeenCalledWith("qw/b", "llm");
    expect((await deps.getSettings()).modelHealthCheckState.requests).toHaveLength(1);
  });
  it("waits until the configured interval is due", async () => {
    const deps = fixture(true, { lastRunAt: Date.now() });
    await runModelHealthCheckTick(deps, { running: false });
    expect(deps.pingModelByKind).not.toHaveBeenCalled();
  });
});
