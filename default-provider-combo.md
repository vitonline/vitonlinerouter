# MyDefaultProvider

The automatically maintained chat combo is configured as Round Robin, with one request per model before rotation. Use `MyDefaultProvider` as the model ID in a chat client.

Membership refreshes when combos are listed or this combo is resolved for routing. It includes chat models from enabled connections, public providers requiring no account, saved custom models, and catalog discoveries. Models from disabled connections and explicitly disabled models are excluded. Media models and nested combos are excluded. Custom provider prefix changes are applied to discovered models by their stable provider ID. Refreshing the Models catalog captures new live model IDs without making catalog network requests during chat routing.

Automatic inclusion reflects configuration, not a successful test or account entitlement. Existing authentication, subscription, model cooldown and fallback behavior still applies. Disable an unwanted model in its provider settings to exclude it from this combo. Membership edits to this managed combo are replaced by the next automatic refresh. Other combos remain manually managed.

Validation: three new automatic membership tests passed. The broader combo run had 41 passing tests and two failures in unchanged `combo-autoswitch.test.js` / `open-sse/services/combo.js`: web-search capability detection and array identity for unchanged capability ordering. New files passed ESLint.

The production CLI build succeeded and the router was restarted. The live setup script created exactly one MyDefaultProvider combo with 625 chat models and verified automatic membership, Round Robin strategy and a per-combo rotation limit of one. The dashboard showed the automatic membership note and Round Robin selection. No fresh completion was requested from every included model; membership does not establish account eligibility or availability.

## Reliability update

MyDefaultProvider now filters candidates at request time using current enabled accounts, account and model cooldowns, and saved text test outcomes. An unlocked alternative connection keeps a model eligible. Recent authentication, subscription, billing, access, unsupported-model, daily check-in and free allowance failures are skipped for up to 24 hours; other saved failures are skipped for five minutes. A successful direct retest replaces the failure. Clearing cooldown explicitly requests verification and lets the model be tried again. These windows are historical-result freshness rules, not claimed provider reset times. Untested models remain eligible.

The combo tries at most three models and waits at most 60 seconds for selection/completion before returning a limit/deadline error. Once streaming headers have been successfully returned, the selection timer is removed so it does not truncate a valid stream. Cancellation is propagated to executor fetches, and no new account attempt begins after cancellation. The attempt budget counts model choices, not provider account retries or credential refresh requests. Existing manual combos keep their default limits.

Validation: 42 targeted tests passed across six files, including deadline cancellation, bounded fallback, successful response bodies, health filtering, automatic membership, Round Robin, fusion and account-success cleanup. ESLint passed. The two previously reported capability-selection failures were not included in this targeted run and remain unresolved.

The six existing chat-core tests also passed (48 targeted passing tests in total). The production build and restart succeeded. Live API verification reported 625 members, 611 eligible candidates, and 14 skipped candidates, with a three-model attempt budget and a 60-second selection deadline. Verification did not test every model or prove a live end-to-end completion for the combo.
