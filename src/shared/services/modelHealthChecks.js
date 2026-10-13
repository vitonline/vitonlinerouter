import { getSettings, updateSettings, getProviderConnections } from "@/lib/localDb";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo";
import { getModelTests, saveModelTest } from "@/lib/db/repos/modelTestsRepo";
import { resolveProviderId } from "@/shared/constants/providers";
import { normalizeModelTestRecord } from "@/shared/utils/modelTestProviders";
import { DEFAULT_HEALTH_CHECK_CONFIG, validateHealthCheckConfig } from "@/shared/utils/healthCheckConfig";
import { pingModelByKind } from "@/app/api/models/test/ping";

const state = global.__modelHealthChecks ??= { interval: null, running: false };
const defaultDeps = { getSettings, updateSettings, getProviderConnections, getProviderNodes, getModelTests, saveModelTest, pingModelByKind };

// Reserve budget before each request. A crash cannot silently replenish the budget.
export async function runModelHealthCheckTick(deps = defaultDeps, runtime = state, now = Date.now()) {
  if (runtime.running) return;
  runtime.running = true;
  try {
    const settings = await deps.getSettings();
    const config = validateHealthCheckConfig(settings.modelHealthChecks || DEFAULT_HEALTH_CHECK_CONFIG);
    if (!config.enabled) return;
    const saved = settings.modelHealthCheckState || {};
    if (now - (saved.lastRunAt || 0) < config.intervalMinutes * 60000) return;
    const ledger = { ...saved, requests: (saved.requests || []).filter(t => now - t < 3600000), events: saved.events || [], statuses: saved.statuses || {}, skipped: [], lastRunAt: now };
    await deps.updateSettings({ modelHealthCheckState: ledger });
    const [connections, nodes, history] = await Promise.all([deps.getProviderConnections(), deps.getProviderNodes(), deps.getModelTests()]);
    const models = config.models;
    const start = (ledger.cursor || 0) % models.length;
    for (let i = 0; i < models.length; i++) {
      const current = await deps.getSettings();
      if (JSON.stringify(current.modelHealthChecks) !== JSON.stringify(settings.modelHealthChecks)) break;
      if (ledger.requests.length >= config.requestsPerHour) break;
      const model = models[(start + i) % models.length];
      const normalized = normalizeModelTestRecord({ model }, nodes);
      const provider = nodes.some(n => n.id === normalized.providerId) ? normalized.providerId : resolveProviderId(model.split("/")[0]);
      if (!connections.some(c => c.provider === provider && c.isActive !== false)) {
        ledger.skipped.push({ model, reason: "No enabled connection; disabled connections were not enabled" });
        continue;
      }
      if (history[model]?.kind && history[model].kind !== "llm") {
        ledger.skipped.push({ model, reason: "Scheduled checks support text models only" });
        continue;
      }
      ledger.cursor = (start + i + 1) % models.length;
      ledger.requests.push(Date.now());
      await deps.updateSettings({ modelHealthCheckState: ledger });
      let result;
      try { result = await deps.pingModelByKind(model, "llm"); }
      catch { result = { ok: false, error: "Scheduled model check could not complete" }; }
      const record = await deps.saveModelTest(model, "llm", result, nodes);
      const status = record.ok ? "Ready" : record.reason || "Test failed";
      const previous = ledger.statuses[model] || (history[model] ? (history[model].ok ? "Ready" : history[model].reason) : null);
      if (previous && previous !== status) ledger.events = [...ledger.events, { model, previous, status, at: new Date().toISOString() }].slice(-50);
      ledger.statuses[model] = status;
      await deps.updateSettings({ modelHealthCheckState: ledger });
    }
    await deps.updateSettings({ modelHealthCheckState: ledger });
  } finally { runtime.running = false; }
}

export function startModelHealthChecks() {
  if (state.interval) return;
  const tick = () => runModelHealthCheckTick().catch(() => console.warn("[ModelHealth] Check could not complete; retry on next interval"));
  tick();
  state.interval = setInterval(tick, 60000);
  state.interval.unref?.();
}
