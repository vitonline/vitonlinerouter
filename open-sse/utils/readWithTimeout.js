import { STREAM_STALL_TIMEOUT_MS } from "../config/runtimeConfig.js";

export async function readWithTimeout(reader, timeoutMs = STREAM_STALL_TIMEOUT_MS, signal = null) {
  let timer, onAbort;
  const deadline = new Promise((_, reject) => {
    const fail = reason => {
      reader.cancel(reason).catch(() => {});
      reject(reason);
    };
    timer = setTimeout(() => fail(new Error("Upstream stream read timed out")), timeoutMs);
    onAbort = () => fail(signal.reason || new Error("Request cancelled"));
    if (signal?.aborted) onAbort(); else signal?.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([reader.read(), deadline]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}
