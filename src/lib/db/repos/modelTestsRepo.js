import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { modelTestKey, modelTestResult } from "@/shared/utils/modelTestResult";
import { normalizeModelTestRecord } from "@/shared/utils/modelTestProviders";
import { summarizeTestHistory } from "@/shared/utils/modelTestHistory";

const SCOPE = "modelTests";

export async function getModelTests() {
  const db = await getAdapter();
  return Object.fromEntries(db.all("SELECT key, value FROM kv WHERE scope = ?", [SCOPE])
    .map((row) => { const record = parseJson(row.value, {}); return [row.key, { ...record, historySummary: summarizeTestHistory(record.attempts || [record]) }]; }));
}

export async function saveModelTest(model, kind, result, nodes = []) {
  const db = await getAdapter();
  const normalized = modelTestResult(result);
  // Persist only bounded diagnostics, never response bodies or credentials.
  const record = normalizeModelTestRecord({
    model: modelTestKey(model), kind, ok: normalized.ok,
    reason: normalized.reason, error: normalized.error.slice(0, 1000),
    status: result.status ?? null, latencyMs: result.latencyMs ?? null,
    testedAt: new Date().toISOString(), state: "done",
    verification: result.verification || null, connectionAccepted: result.connectionAccepted ?? normalized.ok,
    note: typeof result.note === "string" ? modelTestResult({ error: result.note }).error.slice(0, 300) : null,
    capability: result.capability || "text",
  }, nodes);
  let saved;
  db.transaction(() => {
    const previousRow = db.get("SELECT key, value FROM kv WHERE scope = ? AND key = ?", [SCOPE, record.model]) || db.all("SELECT key, value FROM kv WHERE scope = ?", [SCOPE]).find(row => normalizeModelTestRecord(parseJson(row.value, {}), nodes).model === record.model);
    const previous = previousRow ? normalizeModelTestRecord(parseJson(previousRow.value, {}), nodes) : null;
    const attempts = [...(previous?.attempts || (previous ? [{ ...previous, attempts: undefined, capabilities: undefined, historySummary: undefined }] : [])), record].slice(-20);
    const capabilities = { ...previous?.capabilities, [record.capability]: record };
    // Capability failures must not overwrite the basic text availability result.
    saved = { ...(record.capability === "text" || !previous ? record : previous), attempts, capabilities };
    db.run("INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value",
      [SCOPE, record.model, stringifyJson(saved)]);
    if (previousRow && previousRow.key !== record.model) db.run("DELETE FROM kv WHERE scope = ? AND key = ?", [SCOPE, previousRow.key]);
  });
  return { ...record, historySummary: summarizeTestHistory(saved.attempts) };
}
