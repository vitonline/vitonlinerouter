export function validateHealthCheckConfig(input = {}) {
  if (typeof input.enabled !== "boolean" || !Array.isArray(input.models)) throw new Error("Choose models and an enabled state");
  const models = [...new Set(input.models.map(m => typeof m === "string" ? m.trim() : ""))];
  if (models.length > 10 || models.some(m => !m.includes("/") || m.length > 500)) throw new Error("Select up to 10 provider/model IDs");
  if (input.enabled && !models.length) throw new Error("Select at least one model");
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 5 || input.intervalMinutes > 1440) throw new Error("Interval must be 5–1440 minutes");
  if (!Number.isInteger(input.requestsPerHour) || input.requestsPerHour < 1 || input.requestsPerHour > 60) throw new Error("Request budget must be 1–60 per hour");
  return { enabled: input.enabled, models, intervalMinutes: input.intervalMinutes, requestsPerHour: input.requestsPerHour };
}
export const DEFAULT_HEALTH_CHECK_CONFIG = { enabled: false, models: [], intervalMinutes: 60, requestsPerHour: 10 };
