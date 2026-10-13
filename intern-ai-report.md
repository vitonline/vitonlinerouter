# Intern AI provider — 2026-10-12

Added the named **Intern AI** provider with an active saved API-key connection. The key is stored through the existing connection API and is absent from source code and this report. Requests use `https://discovery-api.intern-ai.org.cn/v1/chat/completions`; authenticated live model discovery uses `/v1/models`. Model IDs and capitalization are forwarded unchanged. The provider supports cooldown clearing, saved per-model test results, and provider issue reporting.

Authenticated discovery listed 10 models. Every listed model was tested through FlagshipRouter:

| Model | Result |
| --- | --- |
| Agents-A1 | Passed |
| Atria-Dawn-Preview | Passed |
| deepseek-v4-flash-0731 | Passed |
| deepseek-v4-flash-vision | Passed |
| deepseek-v4-pro-0813 | Passed |
| glm-5.3 | Passed |
| intern-s2 | Timed out after 60 seconds |
| kimi-k2.6 | Passed |
| minimax-m3 | Passed |
| qwen3.8-27b | Passed |

These were small text-generation probes. They do not verify image input, tools, long contexts, or future availability. Discovery also timed out intermittently, although repeated authenticated listings succeeded. The timeout does not establish an authentication or account restriction.

Evidence: [intern-ai-test-results.json](intern-ai-test-results.json). Regression checks: 38 tests passed; provider registration, routing, live catalog behavior, and preserved IDs are covered.

Production compilation and packaging succeeded. Connection validation passed and the dashboard shows the connection as active. Saved model status badges were visually verified. Screenshot: [intern-ai-preview.png](intern-ai-preview.png).

Dashboard: http://localhost:20128/dashboard/providers/intern
