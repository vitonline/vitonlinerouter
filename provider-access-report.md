# Provider access test

Run: 2026-10-12T07:55:24.949Z

39 providers accounted for; 28 probed; 14 had a passing sample; 14 had no passing sample; 11 untested. 32 total probes.

Representative model probes through local router, not every model or every saved credential. 15-second model-test timeout. Disabled connections were not enabled.

## APInex

Claude Opus 5.5 returned upstream 402: requires at least one balance top-up. Free GPT-6 Luna returned upstream 402: daily check-in required at https://apinex.bond/airdrop?tab=quests. Clearing cooldown does not change these account conditions. Neither probe returned the old invalid-key error.

| Provider | Results |
|---|---|
| apinex | apinex/claude-opus-5.5: **Credits or plan restrictions** (363 ms)<br>apinex/free/gpt-6-luna: **Daily check-in required** (168 ms) |
| apmix | apmix/anthropic/claude-sonnet-4-6-free: **Passed** (4185 ms) |
| atria | atria/Atria-Dawn-Preview: **Request timed out** (? ms) |
| bazaarlink | bazaarlink/auto:free: **Passed** (4823 ms) |
| byteplus | byteplus/seed-2-0-pro-260328: **Credits or plan restrictions** (1482 ms) |
| cloudflare-ai | cloudflare-ai/@cf/meta/llama-3.2-1b-instruct: **Authentication rejection** (3458 ms) |
| dahl | dahl/zai-org/GLM-5.3-Flash: **Passed** (1303 ms) |
| excelnt | excelnt/claude-opus-5-5: **Upstream overload** (7374 ms) |
| experientiallabs | experientiallabs/aion-2.0: **Credits or plan restrictions** (1153 ms)<br>experientiallabs/gpt-6-luna: **Credits or plan restrictions** (1201 ms) |
| groq | groq/openai/gpt-oss-120b: **Passed** (1068 ms) |
| kilo-gateway | kilo-gateway/kilo-auto/free: **Passed** (14920 ms) |
| kimchi | No chat model in catalog |
| kiro | kiro/claude-sonnet-4.5: **Passed** (3235 ms) |
| lebang | lebang/claude-fable-5: **Security software blocked upstream** (3689 ms) |
| modelrouter | modelrouter/deepseek-v4.1-flash: **Free allowance exhausted** (3793 ms) |
| nanobanana | nanobanana/nanobanana-flash: **Request timed out** (? ms) |
| nvidia | nvidia/nvidia/nemotron-3-ultra-550b-a55b: **Passed** (3113 ms) |
| ollama | ollama/gpt-oss:120b: **Passed** (1253 ms) |
| openrouter | openrouter/thinkingmachines/inkling-small:free: **Model requires agentic harness** (3539 ms)<br>openrouter/openrouter/free: **Passed** (3223 ms) |
| poolside | poolside/poolside/laguna-s-2.1: **Passed** (1950 ms) |
| qwencloud | qwencloud/qwen3.8-max: **Passed** (3320 ms) |
| teamorouter | teamorouter/deepseek-flash-free: **Credits or plan restrictions** (1101 ms) |
| tokenharbor | tokenharbor/deepseek-v4.1-flash:free: **Free allowance exhausted** (6201 ms) |
| unorouter | unorouter/agnes-2.5-flash:free: **Passed** (1619 ms) |
| xkiro | xkiro/qwen/qwen-plus-2025-07-28:free: **Passed** (3450 ms) |
| zenmux | zenmux/atria-asi/atria-dawn-preview: **Credits or plan restrictions** (1424 ms)<br>zenmux/z-ai/glm-4.7-flash-free: **Rate limit reached** (2739 ms) |
| edge-tts | edge-tts/en-US-AriaNeural: **No active connection** (15 ms) |
| fal-ai | No saved connection |
| google-tts | google-tts/af: **No active connection** (19 ms) |
| huggingface | No saved connection |
| local-device | No saved connection |
| opencode | opencode/muse-spark-1.2-contributor-free: **Passed** (8496 ms) |
| vertex | No saved connection |
| api-airforce | All saved connections disabled |
| tokenrouter | All saved connections disabled |
| selfhosted-stt | No saved connection |
| selfhosted-tts | No saved connection |
| selfhosted-embedding | No saved connection |
| bai | All saved connections disabled |

Full sanitized upstream messages are saved in provider-access-report.json. Dashboard model test history also retains these results. A passing sample does not establish access to other models or every connection. Timeouts do not establish provider outage.
