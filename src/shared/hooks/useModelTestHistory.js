"use client";
import { useState, useEffect, useCallback } from "react";

export function notifyModelTestsChanged() {
  window.dispatchEvent(new Event("model-tests-updated"));
}

export function useModelTestHistory() {
  const [results, setResults] = useState({});
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/models/test", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load saved model tests");
      const data = await res.json();
      setResults(data.results || {});
      setError("");
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("model-tests-updated", refresh);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("model-tests-updated", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { results, error, refresh };
}
