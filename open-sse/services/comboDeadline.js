export async function runComboAttempt(run, model, { signal, remainingMs }) {
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timer, onAbort, finished = false;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(combined.reason || new Error("Combo request aborted"));
    if (combined.aborted) onAbort(); else combined.addEventListener("abort", onAbort, { once: true });
    if (Number.isFinite(remainingMs)) timer = setTimeout(() => controller.abort(new Error("Combo selection deadline exceeded")), Math.max(0, remainingMs));
  });
  const attempt = Promise.resolve().then(() => {
    if (combined.aborted) throw combined.reason;
    return run(model, combined);
  }).then(result => {
    if (finished) result?.body?.cancel().catch(() => {});
    return result;
  });
  try { return await Promise.race([attempt, aborted]); }
  finally { finished = true; clearTimeout(timer); combined.removeEventListener("abort", onAbort); }
}
