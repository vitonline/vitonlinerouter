import REGISTRY from "open-sse/providers/registry/index.js";
import { BRAND } from "open-sse/config/brand.js";
import { normalizeCustomProviderUrl } from "./customProviderUrl";

const reserved = new Set([BRAND.modelPrefix, ...REGISTRY.flatMap(p => [p.id, p.alias, p.uiAlias, ...(p.aliases || [])])].filter(Boolean).map(value => value.toLowerCase()));
function invalid(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
export function validateProviderNode(data, nodes = [], excludeId = null) {
  if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 120) invalid("Provider name must contain 1–120 characters.");
  const prefix = typeof data.prefix === "string" ? data.prefix.trim() : "";
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(prefix)) invalid("Model prefix must use 1–64 lowercase letters, digits, or hyphens and start with a letter.");
  if (reserved.has(prefix) || /^(?:openai-compatible-|anthropic-compatible-|custom-embedding-)/.test(prefix)) invalid("That model prefix is reserved for an existing provider.");
  if (nodes.some(node => node.id !== excludeId && node.prefix?.toLowerCase() === prefix)) invalid("That model prefix is already used. Choose another.", 409);
  if (!["openai-compatible", "anthropic-compatible", "custom-embedding"].includes(data.type)) invalid("Invalid provider node type.");
  if (data.type === "openai-compatible" && !["chat", "responses"].includes(data.apiType)) invalid("Invalid OpenAI compatible API type.");
  if (typeof data.baseUrl !== "string" || !data.baseUrl.trim()) invalid("API base URL is required.");
  let baseUrl;
  try { baseUrl = normalizeCustomProviderUrl(data.baseUrl); } catch(error) { invalid(error.message); }
  return { ...data, name: data.name.trim(), prefix, baseUrl };
}
