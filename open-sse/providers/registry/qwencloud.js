export default {
  id: "qwencloud",
  priority: 100,
  alias: "qwencloud",
  aliases: ["qwen-cloud", "maas"],
  uiAlias: "qw",
  display: {
    name: "QwenCloud",
    icon: "cloud",
    color: "#7C3AED",
    textIcon: "QW",
    website: "https://qwencloud.com",
    notice: {
      text: "Alibaba Model Studio gateway. OpenAI-compatible with bare-slug ids (qwen3.8-max, deepseek-v4-pro, glm-5.3). 1M context. Keys start with sk-; set env DASHSCOPE_API_KEY. Note: the Token Plan uses a different base URL (token-plan.maas.qwencloudapi.com).",
      apiKeyUrl: "https://home.qwencloud.com/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://maas.qwencloudapi.com/compatible-mode/v1/chat/completions",
    format: "openai",
    validateUrl: "https://maas.qwencloudapi.com/compatible-mode/v1/models",
    modelsFetcher: { url: "https://maas.qwencloudapi.com/compatible-mode/v1/models", type: "openai" },
  },
  // Any id the gateway accepts is forwarded untouched (ids are fetched live).
  passthroughModels: true,
  // Catalog from https://www.qwencloud.com/models. Bare slugs, no vendor prefix.
  // Qwen models support enable_thinking via extra_body for reasoning mode.
  models: [
    { id: "qwen3.8-max", name: "Qwen3.8 Max", contextLength: 1048576 },
    { id: "qwen3.8-max-0902", name: "Qwen3.8 Max 0902", contextLength: 1048576 },
    { id: "qwen3.8-flash", name: "Qwen3.8 Flash", contextLength: 1048576 },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus", contextLength: 1048576 },
    { id: "qwen3.7-max", name: "Qwen3.7 Max", contextLength: 1048576 },
    { id: "qwen3.7-flash", name: "Qwen3.7 Flash", contextLength: 1048576 },
    { id: "qwen3.6-plus", name: "Qwen3.6 Plus", contextLength: 1048576 },
    { id: "qwen3.6-flash", name: "Qwen3.6 Flash", contextLength: 1048576 },
    { id: "qwen3-vl-plus", name: "Qwen3 VL Plus", contextLength: 1048576 },
    { id: "glm-5.3", name: "GLM 5.3", contextLength: 1048576 },
    { id: "glm-5.2", name: "GLM 5.2", contextLength: 1048576 },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextLength: 1048576 },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextLength: 1048576 },
    { id: "deepseek-v4-flash-0731", name: "DeepSeek V4 Flash 0731", contextLength: 1048576 },
    { id: "kimi-k3", name: "Kimi K3", contextLength: 1048576 },
    // Media models
    { id: "qwen-image-3.0-pro", name: "Qwen Image 3.0 Pro", kind: "image" },
    { id: "qwen-audio-3.0-tts-flash", name: "Qwen Audio 3.0 TTS Flash", kind: "tts" },
    { id: "qwen-audio-3.0-asr-flash", name: "Qwen Audio 3.0 ASR Flash", kind: "stt" },
    { id: "wan3.0-video", name: "Wan3.0 Video", kind: "video" },
  ],
};
