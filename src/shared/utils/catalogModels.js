// Passthrough gateways publish their current chat IDs. Keep static media specs,
// and retain the entire registry list when the live list cannot be loaded.
export function registryModelsForCatalog(entry, registered, live) {
  if (!entry.passthroughModels || !live.length) return registered;
  return registered.filter(model => (model.kind || model.type || "llm") !== "llm");
}

export function registryModelsFetcher(entry) {
  return entry.modelsFetcher || entry.transport?.modelsFetcher;
}

export function normalizeOpenAIModels(models) {
  return models.filter(model => typeof model?.id === "string" && model.id.trim())
    .map(model => ({ id: model.id.trim(), name: model.name || model.display_name || model.id, contextLength: model.context_length }));
}
