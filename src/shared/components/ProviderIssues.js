"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { runBulkModelTests } from "@/shared/utils/bulkModelTests";

export default function ProviderIssues() {
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/providers/issues", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load provider issues");
      setProviders((await res.json()).providers || []);
      setLoaded(true); setError("");
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) refresh(); });
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("model-tests-updated", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; window.removeEventListener("model-tests-updated", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  async function retest(provider) {
    if (controller.current) return;
    const runController = new AbortController();
    controller.current = runController;
    setBusy(true);
    setError("");
    setProgress({ total: new Set(provider.issues.filter(i => i.scope === "models").flatMap(i => i.models.map(m => m.model))).size, completed: 0, passed: 0, incomplete: 0, failed: 0 });
    try {
      const clear = await fetch("/api/models/availability", { signal: runController.signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clearCooldown", provider: provider.id, model: "__all" }) });
      if (!clear.ok) throw new Error("Could not clear cooldown");
      await runBulkModelTests(provider.issues.filter(i => i.scope === "models").flatMap(i => i.models), {
        signal: runController.signal, concurrency: 2, onProgress: setProgress,
        test: async (model, signal) => {
          const res = await fetch("/api/models/test", { signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: model.model, kind: model.kind || "llm" }) });
          if (!res.ok) throw new Error("Could not complete or save a model test");
          return res.json();
        },
      });
      window.dispatchEvent(new Event("model-tests-updated"));
      await refresh();
    } catch (err) { if (!runController.signal.aborted) setError(err.message); else setProgress(previous => previous ? { ...previous, cancelled: true } : previous); }
    finally { controller.current = null; setBusy(false); }
  }
  return <section aria-label="Provider issues" className="rounded-xl border border-amber-500/30 bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-base font-semibold text-amber-500">Provider issues {loaded && `· ${providers.length}`}</h2>
        <p className="text-xs text-text-muted">Affected models and actions from saved tests and current connections. Tests are historical; setup issues reflect current settings.</p></div>
      <button type="button" onClick={refresh} className="text-xs text-primary">Refresh issues</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
    {progress && <div role="status" aria-live="polite" className="mt-2 text-xs">
      {progress.completed}/{progress.total} completed · {progress.passed} passed · {progress.incomplete} incomplete · {progress.failed} failed{progress.cancelled ? " · Cancelled" : ""}
      {progress.error && <p role="alert">{progress.error}</p>}
      {busy && <button type="button" className="ml-3 text-primary" onClick={() => controller.current?.abort()}>Stop testing</button>}
      <p className="text-text-muted">Up to 2 requests at a time. Stopping cancels queued tests; a request already accepted upstream may still finish.</p>
    </div>}
    {!loaded && !error && <p className="mt-3 text-xs text-text-muted">Loading provider issues…</p>}
    {loaded && !providers.length && <p className="mt-3 text-sm">No recorded issues. Untested models still require a test.</p>}
    <div className="mt-3 max-h-[32rem] overflow-y-auto space-y-3">
      {providers.map((provider, index) => <details key={provider.id} open={index < 2} className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">{provider.name} · {provider.issues.length} issue(s){!!provider.passedModels && <span className="ml-2 text-xs font-normal text-text-muted">{provider.passedModels} model test(s) passed</span>}</summary>
        {provider.issues.map(issue => <div key={`${issue.scope}:${issue.reason}`} className="mt-3 border-l-2 border-amber-500/50 pl-3">
          <p className="text-sm font-medium text-amber-500">{issue.reason}</p>
          <p className="mt-1 text-xs text-text-muted">{issue.action}</p>
          {issue.actionUrl && <a href={issue.actionUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary">Open daily check-in ↗</a>}
          {issue.affected && <p className="mt-2 text-xs">{issue.affected}</p>}
          <ul className="mt-2 space-y-2">{issue.models.map(model => <li key={model.model} className="text-xs">
            <p className="font-mono break-all">{model.model}</p>
            <p className="text-text-muted">Tested {model.testedAt ? new Date(model.testedAt).toLocaleString() : "at an unknown time"}</p>
            <details><summary className="cursor-pointer text-primary">Diagnostic</summary><p className="mt-1 break-words whitespace-pre-wrap text-text-muted">{model.error}</p></details>
          </li>)}</ul>
        </div>)}
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <Link href={provider.manageUrl} className="text-primary">Manage provider / clear cooldown</Link>
          {provider.issues.some(i => i.scope === "models") && <button type="button" disabled={busy} onClick={() => retest(provider)} className="text-primary disabled:opacity-50">{busy ? "Testing…" : "Clear cooldown & retest affected models"}</button>}
        </div>
      </details>)}
    </div>
  </section>;
}
