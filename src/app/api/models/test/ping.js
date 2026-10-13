import { getApiKeys } from "@/lib/localDb";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { unwrapClineEnvelope } from "open-sse/shared/clineEnvelope.js";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { readProbeAsset } from "./probeAssets";

const CLI_TOKEN_SALT = "fr-cli-auth";

export async function getInternalHeaders() {
  let apiKey = null;
  try {
    const keys = await getApiKeys();
    apiKey = keys.find((k) => k.isActive !== false)?.key || null;
  } catch {}

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  headers["x-fr-cli-token"] = await getConsistentMachineId(CLI_TOKEN_SALT);
  return headers;
}

export async function pingModelByKind(model, kind, baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`, { signal } = {}) {
  const timeoutSignal = ms => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  const headers = await getInternalHeaders();
  const start = Date.now();

  if (kind === "embedding") {
    const res = await fetch(`${baseUrl}/api/v1/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: "test" }),
      signal: timeoutSignal(15000),
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }
    const hasEmbedding = Array.isArray(parsed?.data) && parsed.data.length > 0 && Array.isArray(parsed.data[0]?.embedding);
    if (!hasEmbedding) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no embedding data" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  if (kind === "image") {
    const res = await fetch(`${baseUrl}/api/v1/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt: "test" }),
      signal: timeoutSignal(120000),
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }

    const hasImages = Array.isArray(parsed?.data) && parsed.data.length > 0;
    if (!hasImages) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no image data for this model" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  if (kind === "tts") {
    const res = await fetch(`${baseUrl}/api/v1/audio/speech`, {
      method: "POST", headers,
      body: JSON.stringify({ model, input: "Test", response_format: "mp3" }),
      signal: timeoutSignal(30000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const raw = await res.text();
      let parsed; try { parsed = JSON.parse(raw); } catch {}
      return { ok: false, latencyMs, status: res.status, error: `HTTP ${res.status}: ${String(parsed?.error?.message || parsed?.error || raw).slice(0, 500)}` };
    }
    const audio = await res.arrayBuffer();
    if (!res.headers.get("content-type")?.startsWith("audio/") || !audio.byteLength) return { ok: false, latencyMs, status: res.status, error: "Provider returned no audio data for this model" };
    return { ok: true, latencyMs, status: res.status, error: null };
  }

  if (kind === "stt") {
    const form = new FormData();
    const sampleAudio = new Blob([await readProbeAsset("transcription-probe.wav")], { type: "audio/wav" });
    form.append("file", sampleAudio, "test.wav");
    form.append("model", model);

    const res = await fetch(`${baseUrl}/api/v1/audio/transcriptions`, {
      method: "POST",
      headers: Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== "content-type")),
      body: form,
      signal: timeoutSignal(15000),
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }

    const text = typeof parsed?.text === "string" ? parsed.text : "";
    if (!/speech|recognition|test/i.test(text)) {
      return { ok: false, latencyMs, status: res.status, error: "Transcription did not match the spoken test sample" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  if (kind === "systemone") {
    const res = await fetch(`${baseUrl}/api/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        state: "Customer: I was charged twice for my order this morning.",
        questions: {
          probe: { type: "noul", instructions: "Is the customer reporting a billing problem?" },
        },
      }),
      signal: timeoutSignal(15000),
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }

    const hasAnswers = parsed?.answers && typeof parsed.answers === "object" && Object.keys(parsed.answers).length > 0;
    if (!hasAnswers) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no answers for this model" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  const res = await fetch(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      // 1024 tokens: reasoning models (ClinePass/kimi-k3, deepseek-v4-pro, etc.) spend
      // their budget on chain-of-thought before emitting an answer. A tiny probe like
      // max_tokens:16 starves the answer and yields a false "no choices" failure.
      // See issue #3010.
      max_tokens: 1024,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal: timeoutSignal(60000),
  });
  const latencyMs = Date.now() - start;

  const rawText = await res.text().catch(() => "");
  let parsed = null;
  try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

  // Unwrap before the choices checks below. No-op for providers that do not
  // opt in via transport.quirks.clineEnvelope.
  const providerId = resolveProviderId(String(model).split("/")[0]);
  parsed = unwrapClineEnvelope(parsed, providerId);

  if (!res.ok) {
    const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
    return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 500)}` : ""}`, status: res.status };
  }

  const providerStatus = parsed?.status;
  const providerMsg = parsed?.msg || parsed?.message;
  const hasProviderErrorStatus = providerStatus !== undefined
    && providerStatus !== null
    && String(providerStatus) !== "200"
    && String(providerStatus) !== "0";
  if (hasProviderErrorStatus && providerMsg) {
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: `Provider status ${providerStatus}: ${String(providerMsg).slice(0, 240)}`,
    };
  }

  if (parsed?.error) {
    const providerError = parsed?.error?.message || parsed?.error || "Provider returned an error";
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: String(providerError).slice(0, 240),
    };
  }

  const hasChoices = Array.isArray(parsed?.choices) && parsed.choices.length > 0;

  // Reasoning-only output proves request acceptance, but not a usable answer.
  const firstChoice = parsed?.choices?.[0] || {};
  const hasReasoning =
    firstChoice.message?.reasoning ||
    firstChoice.message?.reasoning_content ||
    firstChoice.message?.thinking ||
    firstChoice.message?.thinking_content;
  const content = firstChoice.message?.content;
  const hasContent = typeof content === "string" ? !!content.trim() : Array.isArray(content) && content.some(part => typeof part?.text === "string" && part.text.trim());
  if (hasChoices && !hasContent && hasReasoning) {
    return { ok: false, connectionAccepted: true, verification: "reasoning_only", latencyMs, error: "Provider returned reasoning but no usable answer", status: res.status, note: firstChoice.finish_reason === "length" ? "reasoning-only response (length-limited)" : "reasoning-only response" };
  }

  if (!hasChoices) {
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: "Provider returned no completion choices for this model",
    };
  }

  if (!hasContent) return { ok: false, connectionAccepted: true, verification: "connection_accepted", latencyMs, error: "Provider accepted the request but returned no usable answer", status: res.status };
  return { ok: true, connectionAccepted: true, verification: "usable_response", latencyMs, error: null, status: res.status };
}
