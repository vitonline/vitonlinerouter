export function namespacedToolName(namespace, name) { return namespace ? `${namespace}__${name}` : name; }
export function flattenResponsesTools(tools = [], namespace = null) {
  const flattened = [], namespaceByName = Object.create(null);
  for (const tool of tools) {
    if (tool?.type === "namespace" && typeof tool.name === "string" && Array.isArray(tool.tools)) {
      const group = flattenResponsesTools(tool.tools, namespace ? `${namespace}__${tool.name}` : tool.name);
      flattened.push(...group.tools); Object.assign(namespaceByName, group.namespaceByName);
    } else if (namespace && typeof tool?.name === "string") {
      const name = namespacedToolName(namespace, tool.name);
      flattened.push({ ...tool, name }); namespaceByName[name] = { name: tool.name, namespace };
    } else flattened.push(tool);
  }
  return { tools: flattened, namespaceByName };
}
