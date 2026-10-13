"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_HEALTH_CHECK_CONFIG } from "@/shared/utils/healthCheckConfig";

export default function ModelHealthSchedule() {
  const [config, setConfig] = useState(DEFAULT_HEALTH_CHECK_CONFIG);
  const [state, setState] = useState({});
  const [models, setModels] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const initialized = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/models/health-checks", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load health checks");
        const data = await response.json();
        if (active) {
          setState(data.state);
          if (!initialized.current) {
            initialized.current = true; setConfig(data.config); setModels(data.config.models.join("\n"));
          }
          setLoaded(true);
        }
      } catch (error) { if (active) setMessage(error.message); }
    };
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <section aria-label="Scheduled health checks" className="rounded-xl border border-border bg-surface p-4 text-sm">
    <p className="font-semibold">Scheduled health checks</p>
    <p className="text-xs text-text-muted">Opt-in text tests while the router is running. Each test may consume provider allowance. Disabled connections are skipped. The hourly budget counts model tests and survives restarts; provider retries and credential refreshes may make additional requests.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /> Enable periodic checks</label>
      <label>Interval (minutes) <input aria-label="Health check interval" type="number" min="5" max="1440" value={config.intervalMinutes} onChange={e => setConfig({ ...config, intervalMinutes: Number(e.target.value) })} className="w-20 rounded border border-border bg-surface p-1" /></label>
      <label>Requests per hour <input aria-label="Hourly health check budget" type="number" min="1" max="60" value={config.requestsPerHour} onChange={e => setConfig({ ...config, requestsPerHour: Number(e.target.value) })} className="w-20 rounded border border-border bg-surface p-1" /></label>
    </div>
    <textarea aria-label="Scheduled models" placeholder="provider/model — one per line, up to 10" value={models} onChange={e => setModels(e.target.value)} className="mt-3 w-full rounded border border-border bg-surface p-2" />
    <button disabled={!loaded || busy} className="text-primary disabled:opacity-50" onClick={async () => {
      setBusy(true);
      try {
        const response = await fetch("/api/models/health-checks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, models: models.split(/\n/).map(m => m.trim()).filter(Boolean) }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setConfig(data.config); setMessage("Health check schedule saved");
      } catch (error) { setMessage(error.message); } finally { setBusy(false); }
    }}>Save schedule</button>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    <p className="mt-2 text-xs text-text-muted">Last run: {state.lastRunAt ? new Date(state.lastRunAt).toLocaleString() : "Never"}. Changes appear here; unchanged statuses stay quiet.</p>
    {(state.skipped || []).map(item => <p key={item.model} className="text-xs text-text-muted">{item.model}: {item.reason}</p>)}
    {(state.events || []).slice(-10).reverse().map((event, i) => <p role="status" className="mt-1 text-xs" key={`${event.at}-${i}`}>{event.model}: {event.previous} → {event.status} · {new Date(event.at).toLocaleString()}</p>)}
    <details className="mt-3"><summary>Account allowance and recovery</summary>
      <p className="my-2 text-xs text-text-muted">Subscription renewal and required daily check-in are account actions. Automatic daily check-in is unavailable. Reset information is shown only when the provider reports it.</p>
      <button disabled={busy} className="text-primary" onClick={async () => {
        setBusy(true); try {
          const response = await fetch("/api/models/account-allowances", { signal: AbortSignal.timeout(60000), cache: "no-store" });
          if (!response.ok) throw new Error("Could not read account allowances");
          setAccounts((await response.json()).accounts);
        } catch (error) { setMessage(error.message); } finally { setBusy(false); }
      }}>Refresh account allowances</button>
      {accounts.map(account => <div key={account.id} className="mt-2 text-xs"><strong>{account.name} ({account.provider})</strong> · checked {new Date(account.checkedAt).toLocaleString()}
        {account.message && <p>{account.message}</p>}
        {Object.entries(account.quotas).map(([name, quota]) => <p key={name}>{name}: {quota.unlimited ? "Unlimited" : `${quota.remaining ?? "Unknown"} remaining / ${quota.total ?? "Unknown"}`} · resets {quota.resetAt ? new Date(quota.resetAt).toLocaleString() : "Unknown"}</p>)}
      </div>)}
    </details>
  </section>;
}
