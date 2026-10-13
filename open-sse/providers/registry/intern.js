const provider = {
  id: "intern", priority: 145, alias: "intern", aliases: ["intern-ai"],
  display: {
    name: "Intern AI", icon: "science", color: "#6366F1", textIcon: "IN",
    website: "https://intern-ai.org.cn",
    notice: { text: "Discovery API gateway. Model availability and allowance depend on your account; test models before use.", apiKeyUrl: "https://discovery.intern-ai.org.cn" },
  },
  category: "apikey", authType: "apikey", serviceKinds: ["llm"],
  transport: {
    quirks: { systemMessagesFirst: true, jsonSchemaFallback: true },
    baseUrl: "https://discovery-api.intern-ai.org.cn/v1/chat/completions", format: "openai",
    validateUrl: "https://discovery-api.intern-ai.org.cn/v1/models",
    modelsFetcher: { url: "https://discovery-api.intern-ai.org.cn/v1/models", type: "openai" },
  },
  passthroughModels: true,
  // Fallback IDs observed from authenticated discovery on 2026-10-12.
  models: ["Agents-A1", "Atria-Dawn-Preview", "deepseek-v4-flash-0731", "deepseek-v4-flash-vision", "deepseek-v4-pro-0813", "glm-5.3", "intern-s2", "kimi-k2.6", "minimax-m3", "qwen3.8-27b"].map(id => ({ id, name: id })),
};
export default provider;
