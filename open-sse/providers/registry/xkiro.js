export default {
  id: "xkiro",
  priority: 120,
  alias: "xkiro",
  aliases: [
    "xk",
  ],
  uiAlias: "xkiro",
  display: {
    name: "xKiro",
    icon: "currency_exchange",
    color: "#22C55E",
    textIcon: "XK",
    website: "https://xkiro.com",
    notice: {
      text: "OpenAI-compatible aggregator with a real free tier: 40+ free models and 500K free tokens/day (no card required). Model ids are vendor-prefixed, e.g. qwen/qwen-plus-2025-07-28:free.",
      apiKeyUrl: "https://xkiro.com/dashboard",
    },
  },
  category: "freeTier",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.xkiro.com/v1/chat/completions",
    validateUrl: "https://api.xkiro.com/v1/models",
    // Free tier rate-limits aggressively; retry one 429 like other aggregators.
    retry: {
      429: 2,
    },
  },
  // No provider-wide thinkingFormat: the gateway relays third-party models
  // verbatim, so each model resolves its own wire format via capabilities.js
  // (this id resolves to thinkingFormat "qwen" through the *qwen*plus* family).
  models: [
    // Verified against the live /v1/models catalogue: access_tier "free",
    // pricing 0/0, context_length 131072, vision/tools/reasoning.
    { id: "qwen/qwen-plus-2025-07-28:free", name: "Qwen Plus 0728 (Free)", contextLength: 131072 },
  ],
  // Single seeded model only — no passthrough, so validation accepts exactly
  // what the Models screen lists (xkiro's /v1/models is public and would
  // otherwise let any id through).
};