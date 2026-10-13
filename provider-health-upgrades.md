# Provider health improvements

Implemented on 2026-10-12:

- Custom provider tests store the stable provider node ID. History, issue grouping, and management links follow that ID even when its model prefix changes.
- Chat model tests require nonempty answer text to pass. Reasoning-only replies and accepted requests with empty answers retain separate verification states and actionable explanations.
- Clearing cooldown records an unknown health state and a verification-needed marker, while preserving the previous diagnostic. Completed connection tests and actual requests update that marker from their result.
- Provider nodes validate names, reserved and duplicate prefixes, API types, and HTTP(S) endpoints on the server. Storage validation runs inside the write transaction; invalid updates roll back.

Validation: 105 focused tests passed across 14 files; ESLint checks passed; production CLI build succeeded and the local router restarted. Six live API checks passed: reserved prefixes, unsafe URL schemes, and malformed names returned HTTP 400; history, issue report, and provider node reads returned HTTP 200. Dashboard issue grouping was visually checked after restart.

Existing saved model tests retain their historical results until retested. These changes do not renew subscriptions, add credits, change provider model eligibility, or establish that every external provider currently works.

Live check details: `provider-health-upgrades-verification.json`.
