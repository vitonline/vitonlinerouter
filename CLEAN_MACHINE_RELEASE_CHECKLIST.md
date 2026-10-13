# Clean Windows release gate

Status: pending. A disposable Windows VM and two independently packaged releases are required. A fresh data directory on the development host does not satisfy this gate.

1. Record Windows, Node and package versions, package hashes and installer source. Use a clean VM snapshot with no existing router profile or coding-tool configuration.
2. Install the candidate through the customer installation command. Verify first startup, strong administrator setup, localhost endpoint reachability and denial of unauthenticated management requests. Keep public tunnels and MITM disabled.
3. Connect a customer-owned test account and issue a dedicated inference key. Run the exact coding-tool fixtures included in the offer: real tool execution, streamed output, structured JSON and interruption with no orphaned requests.
4. Exercise concurrent spending/accounting checks. Confirm unknown pricing is explicit and blocked when admission control is enabled. Compare the router's estimate with provider-reported usage; record differences without promising invoice accuracy.
5. Export configuration and inspect it for provider keys, dashboard authentication, proxy credentials, cookies and tokens. Restore into a second isolated installation. Provider connections should be disabled and require reconnection; destination authentication must remain intact.
6. Separately test private full recovery using an encrypted, access-controlled data-directory backup taken while the router is stopped. Native databases and migration backups contain secrets. Do not attach them to public diagnostics.
7. Revoke the dedicated inference key and verify remote requests are rejected. After restoring a private snapshot, test again: snapshots can restore historical active keys. Revoke any reintroduced keys before reconnecting customer traffic.
8. Install the previous release, create realistic fixture data and stop the router. Save a protected snapshot plus the previous package/hash. Update through the customer update flow, verify configuration and usage persistence, then repeat the integration and revocation checks.
9. Simulate a failed update in the VM. Stop both versions and their owned child processes: a closed listening port alone does not prove Windows has released the package directory. Restore the previous package **and its matching pre-update data snapshot**, and verify startup, authentication, provider connection and usage. Do not point an older binary at a migrated database without compatibility evidence.
10. Collect a sanitized report containing versions, hashes, pass/fail flags, HTTP status, selected provider/model and timings. Exclude headers, credentials, conversation bodies and private backup files. Restore the VM snapshot after the test.

Release only for isolated customer installations and the exact integrations that passed. Public multi-tenant deployment, tenant roles/isolation and abuse controls need a separate review. Remaining high-severity dependency advisories and the unverified Codex workflow are tracked in PILOT_RELEASE_READINESS.md.
