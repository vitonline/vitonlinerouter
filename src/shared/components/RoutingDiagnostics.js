"use client";
import { useEffect, useState } from "react";
export default function RoutingDiagnostics() {
  const [traces, setTraces] = useState([]), [config, setConfig] = useState(null), [state, setState] = useState(null), [content, setContent] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/usage/routing"), fetch("/api/settings/spend-control"), fetch("/api/settings")]).then(async responses => {
      if (responses.some(r => !r.ok)) throw new Error("Could not load routing controls");
      const [routing, spend, settings] = await Promise.all(responses.map(r => r.json()));
      if (active) { setTraces(routing.traces); setConfig(spend.config); setState(spend.state); setContent(settings.logRequestContent === true); }
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  return <section aria-label="Routing and spend controls" className="rounded-xl border border-border bg-surface p-4 text-sm">
    <h2 className="font-semibold">Routing and estimated spend controls</h2>
    <p className="text-xs text-text-muted">Chat admission budgets use configured model pricing and conservative reservations. They are estimates, not invoice caps. Unknown prices are blocked while enabled. Missing usage, failures and interrupted streams retain their reservation. Day resets at 00:00 UTC; media endpoints are outside this control.</p>
    {config && <div className="mt-3 flex flex-wrap gap-3 items-center">
      <label><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /> Enable chat spend control</label>
      <label>Daily limit USD <input aria-label="Daily spend limit" type="number" value={config.dailyLimitUsd} onChange={e => setConfig({ ...config, dailyLimitUsd: Number(e.target.value) })} className="w-20 border border-border bg-surface p-1" /></label>
      <label>Output cap <input aria-label="Spend output cap" type="number" value={config.maxOutputTokens} onChange={e => setConfig({ ...config, maxOutputTokens: Number(e.target.value) })} className="w-20 border border-border bg-surface p-1" /></label>
      <button className="text-primary" onClick={async () => { const response = await fetch("/api/settings/spend-control", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }); const result = await response.json(); setMessage(response.ok ? "Spend controls saved" : result.error); }}>Save spend controls</button>
    </div>}
    {state && <p className="mt-2 text-xs">Estimated settled + reserved: ${state.reservedOrSettledUsd.toFixed(4)} · {state.pendingReservations} pending/unverified reservations · {state.day} UTC</p>}
    <label className="mt-3 block"><input type="checkbox" checked={content} onChange={async e => {
      const enabled = e.target.checked;
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logRequestContent: enabled }) });
      if (response.ok) { setContent(enabled); setMessage(enabled ? "Conversation storage opted in; observability must also be enabled" : "New diagnostic records will omit conversation content; existing records are retained"); }
      else setMessage("Could not save conversation logging preference");
    }} /> Store conversation content in diagnostic records (opt-in)</label>
    <p className="text-xs text-text-muted">Routing traces always omit prompts, responses and API keys. Raw file logging separately requires ENABLE_REQUEST_LOGS=true.</p>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    <details className="mt-3"><summary>Recent routes</summary>
      <p className="mt-2 text-xs text-text-muted">Latency measures time until the response is returned; streaming values exclude the remaining stream duration. Attempts count model selections, including fallback, rather than credential retries.</p>
      {traces.slice(0, 10).map(trace => <div key={trace.id} className="mt-2 border-t border-border pt-2 text-xs">
        <strong>{trace.combo}</strong> → {trace.selectedModel || "No model selected"} · HTTP {trace.status} · {trace.attempts.length} model attempts · {trace.latencyMs} ms
        {trace.streamStatus && <p>Stream: {trace.streamStatus.replaceAll("_", " ")}{trace.streamDurationMs != null && ` · total ${trace.streamDurationMs} ms`}{trace.streamError && ` · ${trace.streamError}`}</p>}
        {trace.attempts.map((attempt, i) => <p key={i}>{attempt.provider}: {attempt.model} · HTTP {attempt.status} · {attempt.latencyMs} ms {attempt.error}</p>)}
      </div>)}
      {!traces.length && <p className="mt-2 text-xs">No saved routes yet.</p>}
    </details>
  </section>;
}
