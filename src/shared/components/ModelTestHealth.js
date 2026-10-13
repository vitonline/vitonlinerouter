"use client";
import Link from "next/link";
import { useState } from "react";
import { summarizeTestHistory } from "@/shared/utils/modelTestHistory";

export default function ModelTestHealth({ results, error, onRefresh }) {
  const [model, setModel] = useState("");
  const [capability, setCapability] = useState("streaming");
  const [testing, setTesting] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const records = Object.values(results).sort((a, b) => String(b.testedAt).localeCompare(String(a.testedAt)));
  const failures = records.filter((r) => !r.ok);
  const incomplete = failures.filter(r => r.connectionAccepted);
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-label="Model test health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Model test health</p>
          <p className="text-xs text-text-muted">Last saved tests: {records.length - failures.length} passed · {incomplete.length} incomplete · {failures.length - incomplete.length} failed. Results reflect the test time, not current availability.</p>
        </div>
        <button onClick={onRefresh} className="text-xs text-primary">Refresh status</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <input aria-label="Capability test model" placeholder="provider/model" value={model} onChange={e => setModel(e.target.value)} className="rounded border border-border bg-surface px-2 py-1" />
        <select aria-label="Capability to test" value={capability} onChange={e => setCapability(e.target.value)} className="rounded border border-border bg-surface px-2 py-1">
          {["streaming", "tools", "json", "vision", "reasoning"].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <button disabled={testing || !model.trim()} className="text-primary disabled:opacity-50" onClick={async () => {
          setTesting(true); setProbeResult(null);
          try {
            const res = await fetch("/api/models/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: model.trim(), kind: "llm", capability }) });
            const data = await res.json();
            setProbeResult(res.ok ? `${capability}: ${data.ok ? "verified" : data.error || "unverified"}` : data.error || "Test failed");
            window.dispatchEvent(new Event("model-tests-updated"));
            await onRefresh();
          } catch (err) { setProbeResult(err.message); }
          finally { setTesting(false); }
        }}>{testing ? "Testing capability…" : "Test capability"}</button>
      </div>
      <p className="mt-1 text-xs text-text-muted">One request per capability test. Reasoning requires exposed reasoning and a correct answer.</p>
      {probeResult && <p role="status" className="mt-2 text-xs">{probeResult}</p>}
      {!!records.length && <details className="mt-3">
        <summary className="cursor-pointer text-xs text-primary">Recent test history and capabilities</summary>
        <div className="mt-2 max-h-80 overflow-auto space-y-3">
          {records.map(record => {
            const attempts = record.attempts || [record];
            const summary = record.historySummary || summarizeTestHistory(attempts);
            const textFreshness = record.capability && record.capability !== "text" ? "Text untested" : summarizeTestHistory([record]).stale ? "Text test stale (>24h or unknown time)" : "Text test recent";
            return <details key={record.model} className="rounded border border-border p-2 text-xs">
              <summary className="cursor-pointer"><span className="font-mono">{record.model}</span> · {textFreshness} · {summary.successRate}% success in {summary.attempts} recent attempts · {summary.averageLatencyMs ?? "—"} ms average · {summary.latencyTrend}</summary>
              <button className="mt-2 text-primary" onClick={() => setModel(record.model)}>Use for capability test</button>
              {Object.entries(record.capabilities || {}).map(([name, result]) => <p key={name}>{name}: {result.ok ? "verified" : "unverified"} · {result.testedAt ? new Date(result.testedAt).toLocaleString() : "Unknown time"}</p>)}
              <ul className="mt-2 space-y-1">{[...attempts].reverse().map((attempt, index) => <li key={`${attempt.testedAt}:${index}`}>{attempt.testedAt ? new Date(attempt.testedAt).toLocaleString() : "Unknown time"} · {attempt.capability || "text"} · {attempt.reason} · {attempt.latencyMs ?? "—"} ms</li>)}</ul>
            </details>;
          })}
        </div>
        <p className="mt-1 text-xs text-text-muted">Retains the latest 20 attempts per model. Statistics include capability probes; they are not a routing guarantee.</p>
      </details>}
      {!!failures.length && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-red-500">View {failures.length} model test issues</summary>
          <ul className="mt-2 max-h-64 overflow-auto space-y-2">
            {failures.map((record) => (
              <li key={record.model} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-mono break-all">{record.model}</p>
                  <p title={record.error} className={record.connectionAccepted ? "text-amber-500" : "text-red-500"}>{record.reason}</p>
                  <p className="text-text-muted">Tested {new Date(record.testedAt).toLocaleString()}</p>
                </div>
                {record.model.includes("/") && <Link href={`/dashboard/providers/${encodeURIComponent(record.providerId || record.model.split("/")[0])}`} className="text-primary">Open provider / clear cooldown</Link>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!records.length && !error && <p className="mt-2 text-xs text-text-muted">No saved tests yet. Test a model to check access.</p>}
    </section>
  );
}
