# FlagshipRouter pilot release readiness

Reviewed 13 October 2026. Deployment target: an isolated, self-hosted installation controlled by one customer administrator. This is not a public multi-tenant service approval.

## Changes implemented

- Fixed both capability-selection failures: native web-search tools are detected and capability ordering preserves the original array when the order does not change.
- Added RecommendedModels: 3–5 models require passing text, streaming, tool-call and JSON probes in the last 24 hours. MyDefaultProvider remains experimental. Direct probes verify behavior, not provider-reported model identity. The initial qualifying models share Intern AI, so they do not provide provider-outage redundancy.
- Added metadata-only routing traces for combo and direct chat requests: submitted upstream model/provider, model attempt count, HTTP outcomes, latency and correlation ID. Successful responses carry routing headers. Streaming traces update to completed, cancelled or failed and show total duration; the original latency/headers measure response startup. Credential retries are not separate model attempts. Headers cannot independently prove which model weights a provider used.
- Conversation storage is opt-in for diagnostic records. Routing traces exclude conversation content. Secret redaction applies to stored payloads and gateway console logger output. Existing saved conversation records are not deleted by opting out. Raw file logging separately requires ENABLE_REQUEST_LOGS=true.
- Added an estimated chat admission budget with atomic persistent reservations. Unknown prices are blocked while enabled. Output tokens are capped. Completion usage settles each reservation once. Failures, missing usage and interrupted streams keep their reservation. Budget days use UTC. Provider pricing and token counts can differ from estimates; this is not an invoice cap. Media endpoints are not covered.
- Fixed concurrent accounting: timestamp/token equality no longer collapses distinct requests. Explicit completion event IDs prevent duplicate callbacks from adding usage twice.
- Unknown prices are marked as unknown in usage metadata and excluded from the known-price subtotal; the dashboard shows an unknown-price request count. Older records without the new metadata remain legacy estimates.
- Database configuration exports remove credentials and disable exported provider connections. Configuration restore preserves current dashboard authentication and existing local API keys; credentials must be reconnected. Native migration backups are private recovery files and still contain sensitive data.
- Fixed the database endpoint's password re-authentication bypass: merely supplying a CLI-token header no longer skips the password check; the token value is verified.
- Updated tagline/description/sidebar around self-hosted routing for customer-owned accounts. Existing configured aliases remain aliases, not evidence of model identity or an independently trained product.

The existing public alias `gpt-6-astra` routes to `oc/big-pickle`; it was preserved to avoid changing the user's working configuration. Paid materials must describe it as a custom routing alias, not as verified GPT model access. The Recommended pool does not use this alias.

## Validation artifacts

- recommended-models-verification.json: fresh text/streaming/tools/JSON probes for three Intern models.
- key-revocation-verification.json: a temporary key accepted before revocation and rejected afterward; the fixture key was removed.
- isolated-profile-verification.json: packaged-server startup, unauthenticated management denial, secret-free configuration export, configuration restore and restart persistence in a new Windows profile/data directory. A local upstream fixture exercises ten concurrent requests, streaming and nonstream accounting, admission rejection, output caps, unknown pricing and interrupted-stream reservation retention.
- codex-pilot-verification.json and claude-pilot-verification.json: actual CLI workflow results; inspect pass flags, not just process exit status.
- dependency-audit.json and dependency-audit-after.json: before/after production dependency audit.

The isolated-profile test is on the current host, not a clean operating-system VM. It does not verify the npm installer on a brand-new machine, software update/rollback across distinct releases, every provider, or every coding tool.

The final package build passed. One fresh-profile startup attempt, launched alongside the customer's first restart, timed out after 60 seconds without captured child output; a repeat on the same package passed all checks in under ten seconds. The cause is unproven and startup variability must be investigated in the clean-VM release gate. The final accounting fixture also verifies completed/cancelled stream traces and a trace for the unknown-price admission rejection.

The capability/accounting/Responses/export/routing regression run passed 150 tests across 20 files. Nineteen additional privacy/log-boundary/brand tests passed. The expanded five-test routing suite includes three additional stream completion/cancellation/failure cases; cancellation is recorded before closing the upstream reader to avoid incorrectly marking it completed. Export tests preserve output-token limits while removing authentication tokens. Selected new backend, engine and UI files passed ESLint. EndpointPageClient retains five pre-existing React hook lint errors and two dependency warnings; this is not a clean full-repository lint certification.

All three curated models (`intern/glm-5.3`, `intern/qwen3.8-27b`, `intern/deepseek-v4-flash-0731`) passed the actual Claude Code 2.1.296 fixture: Read tool use, a random marker not disclosed in the prompt, streamed events and structured final JSON. The actual Claude Code interruption check observed text deltas before terminating the caller and verified gateway active requests returned to baseline. This validates a bounded fixture, not arbitrary coding tasks or Anthropic-endorsed support.

After the final stream-tracing change, the actual `RecommendedModels` Claude Code fixture passed again. The interruption rerun also verified the corresponding routing trace changed to cancelled. The live direct-model and combo routing checks passed and matched response correlation headers to stored metadata.

Codex CLI did not pass the file-read fixture. Responses translation now supports namespace-wrapped declarations/continuations and maps `text.format` to the upstream response format. Intern instruction ordering and schema fallback were corrected. Despite these fixes, live Codex attempts returned messages without an observed command execution or the required marker. The captured final attempt contained only message items and `response.completed`, not a function-call item. Model-generated claims about shell policy are not evidence of a host policy rejection. Exclude Codex from the paid supported-integration list until a real command execution and correct final JSON pass. Other coding tools were not certified in this run.

## Authentication, storage and dependency review

The management API is protected by dashboard session or the local machine token. Host-secret/process-spawning endpoints have local-only gates. Remote default-password login is denied. Provider/model routes have API-key checks. A live revoked-key check and a fresh-profile unauthenticated-management check were performed.

The dashboard is a single administrator surface. OIDC/SAML support does not establish tenant isolation or granular roles. Do not give an untrusted team member access to this dashboard. Issue inference keys for access to the router and use isolated customer installations. Public hosting requires a separate authorization, isolation, abuse-control and billing review.

Provider credentials, authentication material and private native backups remain local sensitive files. The data directory needs OS access controls, disk encryption, protected backups and a retention policy. Secret-free configuration exports are not full credential recovery backups. Conversation logging should remain off during pilots unless the customer opts in with an agreed retention policy.

The production audit initially reported six entries: four high and two moderate. DOMPurify was updated to 3.4.17 through an override; the follow-up production audit reports four high entries and no moderate entries. Remaining chains involve braces/micromatch/http-proxy-middleware and node-forge. The registry versions checked had no complete patched resolution. Do not use npm audit fix --force's suggested major downgrade as a substitute for validation. Review removal/replacement or upstream patches before exposing the service publicly. MITM certificate generation uses node-forge; its presence does not itself prove that the advisory's signature-verification path is reachable here.

Claude Code gateway documentation explicitly does not promise support for non-Claude models. A passing local experiment with Intern AI must not be advertised as Anthropic-supported compatibility. See [Anthropic gateway documentation](https://code.claude.com/docs/en/llm-gateway).

## Remaining release gates

1. Resolve the Codex CLI workflow failure before offering Codex support. Repeat the real tool-call/structured-output/cancellation fixtures for every additional coding tool included in the paid offer. The three curated Claude Code fixtures and its cancellation check passed; broader workflows remain outside this evidence.
2. Run installation and update/rollback on a disposable clean Windows VM with Node installed and no prior router data. Keep a versioned previous package and database snapshot, verify rollback after an intentionally failed update, and test key revocation after restore.
3. Resolve or explicitly mitigate remaining dependency advisories for the deployed surface. Verify no public tunnel, MITM or remote management is enabled by the pilot configuration.
4. Add a second independently tested provider to the Recommended pool before selling provider-outage resilience.
5. Keep the $199 pilot scope limited to the exact integrations and deployment tested. Do not promise unlimited inference, exact savings, a security certification or an uptime SLA.

## Reproduction

Run the unit tests under tests/ with `rtk proxy npm exec -- vitest run --maxWorkers=1`. Use scripts/verify-recommended-models.mjs for model probes, scripts/verify-key-revocation.mjs for the owned temporary-key fixture, and scripts/verify-isolated-profile.mjs for a fresh-profile packaged-server test. The latter uses port 20129 and cleans only its own temporary data directory. None of these scripts deploys a public service.

For Claude Code fixtures, `PILOT_MODEL` selects one of the curated model IDs. For Codex, set `LOCAL_CODEX_BINARY` to the locally installed executable; the harness uses an isolated workspace/configuration and a metadata-only loopback proxy on port 20130. `PILOT_NO_OUTPUT_SCHEMA=1` is a diagnostic variant, not a passing structured-output certification. See CLEAN_MACHINE_RELEASE_CHECKLIST.md for the remaining VM procedure.
