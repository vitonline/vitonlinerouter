import { assertPublicUrlResolved } from "./ssrfGuard.js";

// Local model servers are an explicit feature, not arbitrary internal URLs.
// Additional LAN/private origins require operator configuration, never a body flag.
export async function assertProviderEndpoint(url, { local = false } = {}) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Blocked provider URL");
  }
  const allowlist = (process.env.PROVIDER_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const localOllama = local && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && parsed.port === "11434";
  if (localOllama || allowlist.includes(parsed.origin)) return;
  if (!local && parsed.protocol !== "https:") throw new Error("Provider endpoint must use HTTPS");
  await assertPublicUrlResolved(parsed.href);
}
