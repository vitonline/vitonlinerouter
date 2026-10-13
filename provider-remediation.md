# Provider issue remediation

The dashboard home and Models page now show **Provider issues**, grouped by provider, issue, and affected model. Each entry includes a saved test timestamp, sanitized diagnostic, next action, and provider management link. Model issues can be cleared and retested from the section. Connection issues show their scope separately from tested model failures.

Implemented fixes:

- Speech probes now use `/api/v1/audio/speech`, require nonempty audio, and no longer fall through to chat.
- Test budgets are 60 seconds for chat, 120 seconds for image generation, and 30 seconds for speech. Timeout results retain elapsed time.
- Unsupported test types fail explicitly instead of being sent to chat.
- Specific reasons are recognized inside wrapped upstream errors: daily check-in, CodingPlan expiry, model not found, free-tier exhaustion, agentic-harness restriction, and security blocks.
- Current live chat IDs take precedence over stale static IDs for passthrough providers. Static media specifications and offline model fallbacks are retained.
- Live model discovery reads registry transport metadata, supports OpenAI-style model lists, and authenticates with an active saved key. The connection model-list API also supports those registry-declared endpoints.
- Duplicate registry entries no longer duplicate provider issues.
- The Models page no longer claims every listed model costs zero or becomes accessible simply by connecting a provider.

## Live retest results

| Provider/model | Result | Elapsed |
|---|---|---|
| Atria / Atria-Dawn-Preview | Passed | 10,662 ms |
| NanoBanana / nanobanana-flash | Passed | 10,168 ms |
| Edge TTS / en-US-AriaNeural | Passed | 909 ms |
| Google TTS / af | Passed | 1,265 ms |
| Cloudflare / llama-3.2-1b-instruct | Authentication rejection | 3,274 ms |
| Excelnt / claude-opus-5-5 | Upstream overload | 7,060 ms |

Full evidence: [provider-remediation-results.json](provider-remediation-results.json). These are model samples, not proof of access to every model or credential. Atria and NanoBanana passed on retest; provider timing may vary.

## Remaining account and service actions

- **APInex:** free GPT requires a daily check-in; the tested paid Claude requires at least one balance top-up. The authenticated live list now includes `gpt-6.1-sol` and excludes the obsolete `gpt-6-sol`; the dashboard catalog matches those current IDs. A live test of `gpt-6.1-sol` returned **Insufficient balance**. The alternative `free/claude-opus-4.6` returned **subscription required**. No supported daily check-in API was verified in the public documentation, so the dashboard links to the manual check-in at https://apinex.bond/airdrop?tab=quests. Additional evidence is saved in `apinex-current-model-results.json`.
- **BytePlus:** upstream reports an expired or missing CodingPlan subscription. Review subscription and endpoint in the provider account.
- **Cloudflare:** Account ID is present, but authentication is rejected. Verify token validity, permissions, and account association; the router cannot generate a replacement token.
- **Experiential Labs / TeamoRouter / ZenMux:** balance, purchase, or eligibility conditions require provider account action.
- **ModelRouter / Token Harbor:** free allowance is exhausted. Clearing local cooldown does not replenish it.
- **OpenRouter:** its general free router passed; the Inkling sample requires an agentic harness.
- **Excelnt:** upstream overload remains; retry later or choose another model/provider.
- **Lebang:** security software blocked the upstream domain. The block was not bypassed.
- **Disabled / unconfigured connections:** their current state is listed; intentional disabled settings were preserved.

Regression verification: 78 focused tests passed. Production compilation and packaging succeeded. After the user signed in, visual verification passed on both the dashboard home and Models page: grouped provider issues, affected models, daily check-in link, CodingPlan warning, and disabled-connection notices are displayed. Dashboard evidence: [provider-issues-preview.png](provider-issues-preview.png).
