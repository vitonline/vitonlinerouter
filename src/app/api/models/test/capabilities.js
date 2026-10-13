import { getInternalHeaders } from "./ping";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { readProbeAsset } from "./probeAssets";

export const CAPABILITIES = ["text", "streaming", "tools", "json", "vision", "reasoning"];

export async function pingCapability(model, capability, { signal, baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}` } = {}) {
  const started = Date.now();
  const body = { model, max_tokens: 1024, stream: false, messages: [{ role: "user", content: 'Reply with the word READY.' }] };
  if (capability === "streaming") body.stream = true;
  if (capability === "json") {
    body.response_format = { type: "json_object" };
    body.messages[0].content = 'Return only JSON: {"probe":"READY"}';
  }
  if (capability === "tools") {
    body.tools = [{ type: "function", function: { name: "health_probe", description: "Report readiness", parameters: { type: "object", properties: { probe: { type: "string", enum: ["READY"] } }, required: ["probe"], additionalProperties: false } } }];
    body.tool_choice = { type: "function", function: { name: "health_probe" } };
    body.messages[0].content = 'Call health_probe with probe set to READY.';
  }
  if (capability === "vision") {
    const png = await readProbeAsset("vision-probe.png");
    body.messages[0].content = [{ type: "text", text: "What is the dominant color of this image? Answer in English with one color word." }, { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }];
  }
  if (capability === "reasoning") {
    body.reasoning_effort = "low";
    body.messages[0].content = 'Think through this: three boxes hold two balls each. How many balls? Explain briefly and give the total.';
  }
  const timeout = AbortSignal.timeout(60000);
  const response = await fetch(`${baseUrl}/api/v1/chat/completions`, { method: "POST", headers: await getInternalHeaders(), body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const raw = await response.text();
  const result = { capability, latencyMs: Date.now() - started, status: response.status, connectionAccepted: response.ok };
  if (!response.ok) return { ...result, ok: false, error: `HTTP ${response.status}: ${raw.slice(0, 500)}` };
  let valid = false;
  if (capability === "streaming") {
    let text = "", done = false, failed = false;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") { done = true; continue; }
      try { const chunk = JSON.parse(payload); if (chunk.error) failed = true; text += chunk.choices?.[0]?.delta?.content || ""; } catch { failed = true; }
    }
    valid = response.headers.get("content-type")?.includes("text/event-stream") && done && !!text.trim() && !failed;
  } else {
    let parsed;
    try { parsed = JSON.parse(raw); } catch {}
    const message = parsed?.choices?.[0]?.message;
    if (!parsed?.error) {
      if (capability === "json") { try { valid = JSON.parse(message?.content)?.probe === "READY"; } catch {} }
      if (capability === "tools") { try { const call = message?.tool_calls?.[0]; valid = call?.function?.name === "health_probe" && JSON.parse(call.function.arguments)?.probe === "READY"; } catch {} }
      if (capability === "vision") valid = typeof message?.content === "string" && /\bred\b/i.test(message.content);
      if (capability === "reasoning") valid = typeof message?.content === "string" && /\b6\b|\bsix\b/i.test(message.content) && !!(message.reasoning || message.reasoning_content || message.thinking || message.thinking_content);
    }
  }
  return { ...result, ok: !!valid, verification: valid ? "usable_response" : "capability_unverified", error: valid ? null : `${capability} capability not verified by the response`, note: capability === "reasoning" ? "Requires exposed reasoning plus a correct final answer; hidden reasoning cannot be verified." : null };
}
