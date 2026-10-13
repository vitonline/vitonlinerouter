import { createHash } from "node:crypto";

const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

function positiveLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

// Metadata only: never retain the API key itself.
export function checkApiRequestLimit(apiKey, peer) {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  const identities = [
    [`key:${createHash("sha256").update(apiKey || `local:${peer}`).digest("hex")}`, positiveLimit("API_REQUESTS_PER_MINUTE", 120)],
    [`peer:${peer || "unknown"}`, positiveLimit("API_PEER_REQUESTS_PER_MINUTE", 600)],
  ];
  for (const [key, limit] of identities) {
    const bucket = buckets.get(key);
    if (bucket && bucket.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  if (buckets.size + identities.filter(([key]) => !buckets.has(key)).length > MAX_BUCKETS) return { allowed: false, retryAfter: 60 };
  for (const [key] of identities) {
    const bucket = buckets.get(key) || {count: 0, resetAt: now + WINDOW_MS};
    bucket.count++;
    buckets.set(key, bucket);
  }
  return { allowed: true };
}

export const __test__ = { reset: () => buckets.clear() };
