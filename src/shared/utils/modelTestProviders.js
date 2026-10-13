import { modelTestKey } from "./modelTestResult";
export function normalizeModelTestRecord(record, nodes = []) {
  const model = modelTestKey(record.model);
  const slash = model.indexOf("/");
  const prefix = slash < 0 ? model : model.slice(0, slash);
  const node = nodes.find(n => n.id === record.providerId || n.id === prefix || n.prefix === prefix);
  return { ...record, providerId: node?.id || prefix, model: node && slash >= 0 ? `${node.prefix}/${model.slice(slash + 1)}` : model };
}
export function normalizeModelTestHistory(records, nodes = []) {
  const normalized = {};
  for (const record of Object.values(records)) {
    const result = normalizeModelTestRecord(record, nodes);
    if (!normalized[result.model] || String(result.testedAt) >= String(normalized[result.model].testedAt)) normalized[result.model] = result;
  }
  return normalized;
}
