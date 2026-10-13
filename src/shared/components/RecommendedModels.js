"use client";
import { useEffect, useState } from "react";
export default function RecommendedModels() {
  const [data, setData] = useState(null), [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/models/recommended", { signal: controller.signal, cache: "no-store" }).then(r => r.json()).then(setData).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, []);
  return <section aria-label="Recommended models" className="rounded-xl border border-border bg-surface p-4">
    <h2 className="font-semibold">Recommended models</h2>
    <p className="text-xs text-text-muted">A small pool with passing text, streaming, tool-call and JSON probes from the last 24 hours. These probes do not establish model identity or guarantee every coding-tool workflow. MyDefaultProvider remains an experimental catalog pool.</p>
    <div className="mt-2 flex flex-wrap gap-2">{data?.models?.map(model => <code key={model} className="rounded border border-border p-2 text-xs">{model}</code>)}</div>
    <button className="mt-3 text-sm text-primary disabled:opacity-50" disabled={!data || data.models.length < 3} onClick={async () => {
      try {
        const response = await fetch("/api/models/recommended", { method: "POST" });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        setMessage(`Ready: use ${result.name} in your coding tool (${result.models.length} models)`);
      } catch (error) { setMessage(error.message); }
    }}>Create / refresh RecommendedModels combo</button>
    {data && data.models.length < 3 && <p className="mt-2 text-xs">{data.models.length} qualified; at least three are required. Test more models before using this pool.</p>}
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </section>;
}
