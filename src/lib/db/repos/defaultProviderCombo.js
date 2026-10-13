import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { ALLOWED_REGISTRY } from "open-sse/providers/policy.js";
import { PROVIDER_MODELS } from "open-sse/config/providerModels.js";
import { collectDefaultProviderModels, DEFAULT_PROVIDER_COMBO } from "@/shared/utils/defaultProviderCombo";

export function syncDefaultProviderCombo(db) {
  const settings = parseJson(db.get("SELECT data FROM settings WHERE id = 1")?.data, {});
  if (!settings.autoDefaultProviderCombo) return;
  const combo = db.get("SELECT * FROM combos WHERE name = ?", [DEFAULT_PROVIDER_COMBO]);
  if (!combo) return;
  const disabled = Object.fromEntries(db.all("SELECT key, value FROM kv WHERE scope = ?", ["disabledModels"]).map(r => [r.key, parseJson(r.value, [])]));
  const models = collectDefaultProviderModels({
    registry: ALLOWED_REGISTRY.filter(p => !p.hidden), registered: PROVIDER_MODELS,
    connections: db.all("SELECT provider, isActive FROM providerConnections"),
    nodes: db.all("SELECT * FROM providerNodes").map(r => ({ ...parseJson(r.data, {}), id: r.id, type: r.type })),
    custom: db.all("SELECT value FROM kv WHERE scope = ?", ["customModels"]).map(r => parseJson(r.value, {})),
    discovered: db.all("SELECT value FROM kv WHERE scope = ?", ["defaultComboCatalog"]).flatMap(r => parseJson(r.value, [])), disabled,
  });
  if (stringifyJson(models) !== combo.models) db.run("UPDATE combos SET models = ?, updatedAt = ? WHERE id = ?", [stringifyJson(models), new Date().toISOString(), combo.id]);
}

export async function enableDefaultProviderCombo() {
  const db = await getAdapter();
  db.transaction(() => {
    const settings = parseJson(db.get("SELECT data FROM settings WHERE id = 1")?.data, {});
    const now = new Date().toISOString();
    if (!db.get("SELECT id FROM combos WHERE name = ?", [DEFAULT_PROVIDER_COMBO])) db.run("INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)", [uuidv4(), DEFAULT_PROVIDER_COMBO, "llm", "[]", now, now]);
    const next = { ...settings, autoDefaultProviderCombo: true, comboStrategies: { ...settings.comboStrategies, [DEFAULT_PROVIDER_COMBO]: { fallbackStrategy: "round-robin", stickyRoundRobinLimit: 1 } } };
    db.run("INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [stringifyJson(next)]);
    syncDefaultProviderCombo(db);
  });
}

// Capture live catalog discoveries without adding network work to chat requests.
export async function rememberDefaultComboCatalog(models) {
  const db = await getAdapter();
  const groups = new Map();
  for (const model of models) {
    if (model.source === "rename" || model.kind !== "llm" || !model.providerId || !model.modelId) continue;
    if (!groups.has(model.providerId)) groups.set(model.providerId, []);
    groups.get(model.providerId).push({ providerId: model.providerId, modelId: model.modelId, kind: "llm" });
  }
  db.transaction(() => {
    for (const [provider, records] of groups) db.run("INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value", ["defaultComboCatalog", provider, stringifyJson(records)]);
    syncDefaultProviderCombo(db);
  });
}
