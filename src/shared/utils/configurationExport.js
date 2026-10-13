import { redactSecretText } from "open-sse/utils/redactSecrets";
const PRIVATE = /password|secret|token$|^(?:tokens|key)$|api.?key|auth.?key|authorization|cookie|credential|sudo|certificate|private.?key/i;
export function stripExportSecrets(value) {
  if (Array.isArray(value)) return value.map(stripExportSecrets);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE.test(key)).map(([key, item]) => [key, stripExportSecrets(item)]));
  if (typeof value === "string") {
    const redacted = redactSecretText(value);
    try { const url = new URL(redacted); if (url.username || url.password) { url.username = ""; url.password = ""; return url.toString(); } } catch { /* Plain configuration strings. */ }
    return redacted;
  }
  return value;
}
export function configurationExport(payload) {
  return { ...stripExportSecrets(payload), configurationOnly: true, exportVersion: 1, apiKeys: [],
    providerConnections: (payload.providerConnections || []).map(c => ({ ...stripExportSecrets(c), isActive: false })),
    settings: { ...stripExportSecrets(payload.settings), requireLogin: true, requireApiKey: true, tunnelEnabled: false, tailscaleEnabled: false, cloudEnabled: false, logRequestContent: false },
  };
}
