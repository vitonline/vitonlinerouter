const SENSITIVE_FIELD = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|client[-_]?secret|x-vr-cli-token)$/i;

export function redactSecretText(value) {
  return String(value)
    .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-[\w.*-]+|(?:apx|thk|xpl|sk)_live_[\w.*-]+|nvapi-[\w-]+|gsk_[\w-]+)/g, "[REDACTED]")
    .replace(/([?&](?:api[-_]?key|token|access_token|key)=)[^&\s"']+/gi, "$1[REDACTED]");
}

// Return a sanitized copy; never alter the request passed to the provider.
export function redactSecrets(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactSecretText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => redactSecrets(item, seen))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      SENSITIVE_FIELD.test(key) ? "[REDACTED]" : redactSecrets(item, seen),
    ]));
  seen.delete(value);
  return result;
}
