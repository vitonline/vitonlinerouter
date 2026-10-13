export const DEFAULT_PROVIDER_COMBO = "MyDefaultProvider";

export function collectDefaultProviderModels({ registry, registered, connections, nodes = [], custom = [], discovered = [], disabled = {} }) {
  const active = new Set(connections.filter(c => c.isActive !== false && c.isActive !== 0).map(c => c.provider));
  const providers = new Map(registry.map(p => [p.id, { ...p, prefix: p.alias || p.id }]));
  for (const node of nodes) if (["openai-compatible", "anthropic-compatible"].includes(node.type)) providers.set(node.id, { ...node, prefix: node.prefix });
  const ids = new Set();
  const add = (provider, model) => {
    if (!provider || (!provider.noAuth && !active.has(provider.id))) return;
    if ((model.kind || model.type || "llm") !== "llm") return;
    const id = typeof model.id === "string" ? model.id.trim() : "";
    if (!id || !provider.prefix || (disabled[provider.prefix] || []).includes(id) || (disabled[provider.id] || []).includes(id)) return;
    ids.add(`${provider.prefix}/${id}`);
  };
  for (const provider of providers.values()) {
    const live = discovered.filter(m => m.providerId === provider.id);
    if (!provider.passthroughModels || !live.length) for (const model of registered[provider.prefix] || []) add(provider, model);
  }
  for (const model of custom) add([...providers.values()].find(p => p.prefix === model.providerAlias || p.id === model.providerAlias), model);
  for (const model of discovered) add(providers.get(model.providerId), { ...model, id: model.modelId });
  return [...ids].sort();
}
