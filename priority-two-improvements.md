# Priority 2 improvements

Implemented:

- Provider-issue retests deduplicate affected models, run at most two requests at a time, report completed/total and outcomes, and offer Stop testing. A failed request does not prevent testing the remaining queue. Abort signals reach the internal probe; cancelled probes are not saved as provider failures. A request already accepted upstream may still finish there.
- Saved history retains 20 bounded, sanitized attempts per model in a transactional write. History survives custom-provider prefix changes. The Models health panel shows attempt history, success percentage, average latency, latency trend, text-test freshness (24 hours), and separately saved capability results. Historical passes remain historical.
- Explicit capability probes test streaming completion, a forced tool call with valid arguments, a JSON marker, a red image, and exposed reasoning with a correct final answer. A capability probe cannot overwrite the existing basic text test result. Hidden reasoning is reported as unverified.
- STT probes use bundled synthetic speech saying “Hello, this is a speech recognition test.” They require recognition of a phrase keyword; the old silent WAV probe was removed. This is a small smoke test, not an accuracy benchmark.

Validation: 121 focused tests passed across 15 files; changed production files passed ESLint. History retention, rename migration, cancellation, concurrency, malformed capability responses, streaming completion, and non-silent speech data are covered.

The new history begins with the previously retained latest test; earlier attempts that were overwritten before this change cannot be reconstructed.

The production CLI build succeeded and the router restarted. Live Intern AI `qwen3.8-27b` probes verified streaming, JSON, and tool calling. Saved history contained all three probes and preserved the prior text test result and timestamp. The Models history view and the bulk test progress/stop interaction were visually verified; stopping showed Cancelled with zero failed tests. Vision, reasoning, and spoken-audio fixture behavior have deterministic regression coverage; no live accuracy claim is made for those probes.

Evidence: `priority-two-live-verification.json`, `priority-two-preview.png`, and `priority-two-cancel-preview.png`.

After cancelling the slow Intern test, its previous timestamp and single saved attempt were unchanged. A fresh text test of `intern/qwen3.8-27b` then passed in 15,103 ms, verifying the connection again after the cooldown clear.
