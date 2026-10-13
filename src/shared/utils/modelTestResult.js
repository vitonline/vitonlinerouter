import { redactSecretText } from "open-sse/utils/redactSecrets.js";
import { resolveProviderId } from "@/shared/constants/providers.js";

export function modelTestKey(model) {
  const slash = String(model).indexOf("/");
  return slash < 0 ? String(model) : `${resolveProviderId(model.slice(0, slash))}/${model.slice(slash + 1)}`;
}

// Use the upstream message before the outer router status (e.g. 503 wrapping 401).
export function modelTestReason(error, status) {
  const text = typeof error === "string" ? error : JSON.stringify(error || "");
  if (/WebShield|malicious_url|security software.*block/i.test(text)) return "Security software blocked upstream";
  if (/daily check.in/i.test(text)) return "Daily check-in required";
  if (/does not support the coding plan feature|UnsupportedModel.*coding\s*plan/i.test(text)) return "Model incompatible with CodingPlan";
  if (/InvalidSubscription|valid CodingPlan|CodingPlan.*(?:expired|missing)/i.test(text)) return "Expired or missing CodingPlan subscription";
  if (/No active credentials|No credentials for provider/i.test(text)) return "No active connection";
  if (/agentic harnesses|Gate Free Endpoints by Agentic Harness/i.test(text)) return "Model requires agentic harness";
  if (/invalid_api_key|incorrect api key|authentication error|unauthorized|\[401\]|HTTP 401/i.test(text) || status === 401) return "Authentication rejection";
  if (/free_tier_limit_(?:exceeded|reached)|free.*(?:allowance|quota|limit).*(?:used|exhaust|reach)|(?:used|exhaust|reach).*free.*(?:allowance|quota|limit)|rolling 7.day/i.test(text)) return "Free allowance exhausted";
  if (/model_requires_purchase|credits|balance|billing|payment|needs.*plan|paid model|subscription|eligible quota/i.test(text) || status === 402) return "Credits or plan restrictions";
  if (/capacity|overload|high load|site-wide.*full/i.test(text)) return "Upstream overload";
  if (/unsupportedmodel|model.{0,120}not found|does not support|unsupported model|\[404\]|HTTP 404/i.test(text) || status === 404) return "Model unsupported or unavailable";
  if (/rate.limit|too many requests|\[429\]|HTTP 429/i.test(text) || status === 429) return "Rate limit reached";
  if (/permission|access denied|forbidden|\[403\]|HTTP 403/i.test(text) || status === 403) return "Access restricted";
  if (/timeout|timed out|aborted/i.test(text)) return "Request timed out";
  if (/network|fetch failed|failed to fetch|certificate/i.test(text)) return "Connection error";
  if (/\[50[234]\]|HTTP 50[234]/i.test(text) || status >= 500) return "Upstream unavailable";
  return "Test failed";
}

export function modelTestResult(data) {
  const error = typeof data.error === "string" ? data.error : data.error ? JSON.stringify(data.error) : "";
  return {
    ...data,
    ok: !!data.ok,
    // Provider messages may echo credentials. Never display those in tooltips.
    error: redactSecretText(error),
    reason: data.verification === "capability_unverified" ? `${data.capability || "Requested"} capability unverified` : data.verification === "reasoning_only" ? "Reasoning only; no usable answer" : data.verification === "connection_accepted" ? "Connection accepted; no usable answer" : data.ok ? "Test passed" : modelTestReason(error, data.status),
  };
}
