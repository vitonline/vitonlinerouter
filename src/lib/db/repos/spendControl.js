import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver";
import { getSettings } from "./settingsRepo";
import { getPricingForModel } from "./pricingRepo";
import { parseJson } from "../helpers/jsonCol";
import { calculateCostFromTokens } from "open-sse/providers/pricing";
export const DEFAULT_SPEND_CONTROL = { enabled: false, dailyLimitUsd: 10, maxOutputTokens: 4096 };
export function validateSpendControl(config) {
  if (typeof config?.enabled !== "boolean" || !Number.isFinite(config.dailyLimitUsd) || config.dailyLimitUsd <= 0 || config.dailyLimitUsd > 10000 || !Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 32768) throw new Error("Choose a positive daily USD limit up to 10000 and an output cap of 1–32768 tokens");
  return { enabled: config.enabled, dailyLimitUsd: config.dailyLimitUsd, maxOutputTokens: config.maxOutputTokens };
}
function read(db, day) { return parseJson(db.get("SELECT value FROM kv WHERE scope = ? AND key = ?", ["spendControl", day])?.value, { entries: {} }); }
function write(db, day, ledger) { db.run("INSERT INTO kv(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value", ["spendControl", day, JSON.stringify(ledger)]); }
export async function reserveSpend(provider, model, body) {
  const config = validateSpendControl((await getSettings()).spendControl || DEFAULT_SPEND_CONTROL);
  if (!config.enabled) return { body, id: null };
  const pricing = await getPricingForModel(provider, model);
  if (!pricing || ![pricing.input, pricing.output].every(rate => Number.isFinite(rate) && rate >= 0)) throw new Error("Spend control: model pricing is unknown; configure verified rates before using this model");
  const maxOutput = Math.min(config.maxOutputTokens, body.max_output_tokens || body.max_completion_tokens || body.max_tokens || config.maxOutputTokens);
  if (!Number.isInteger(maxOutput) || maxOutput < 1) throw new Error("Invalid maximum output tokens");
  const rate = Math.max(...Object.values(pricing).filter(v => Number.isFinite(v) && v >= 0));
  // Conservative admission estimate, not a guarantee of the provider's invoice.
  const reserved = (Buffer.byteLength(JSON.stringify(body), "utf8") + 4096 + maxOutput) * rate / 1000000;
  const db = await getAdapter(), day = new Date().toISOString().slice(0, 10), id = `${day}/${randomUUID()}`;
  db.transaction(() => {
    const ledger = read(db, day);
    const held = Object.values(ledger.entries).reduce((sum, entry) => sum + entry.amount, 0);
    if (held + reserved > config.dailyLimitUsd) throw new Error("Daily estimated spend budget exhausted");
    ledger.entries[id] = { amount: reserved, state: "reserved", provider, model, at: Date.now() };
    write(db, day, ledger);
  });
  return { id, body: { ...body, max_tokens: maxOutput, ...(body.max_output_tokens ? { max_output_tokens: maxOutput } : {}), ...(body.max_completion_tokens ? { max_completion_tokens: maxOutput } : {}) } };
}
export async function settleSpend(id, tokens) {
  if (!id || !tokens) return;
  const db = await getAdapter(), day = id.slice(0, 10), ledger = read(db, day), entry = ledger.entries[id];
  if (!entry || entry.state === "settled") return;
  const pricing = await getPricingForModel(entry.provider, entry.model);
  if (!pricing) return;
  const cost = calculateCostFromTokens(tokens, pricing);
  if (!Number.isFinite(cost) || cost < 0) return;
  db.transaction(() => {
    const current = read(db, day);
    if (current.entries[id]?.state === "settled") return;
    current.entries[id] = { ...current.entries[id], amount: cost, state: "settled" };
    write(db, day, current);
  });
}
export async function getSpendControlState() {
  const db = await getAdapter(), day = new Date().toISOString().slice(0, 10), entries = Object.values(read(db, day).entries);
  return { day, timezone: "UTC", reservedOrSettledUsd: entries.reduce((sum, entry) => sum + entry.amount, 0), pendingReservations: entries.filter(e => e.state === "reserved").length, pricing: "estimated" };
}
