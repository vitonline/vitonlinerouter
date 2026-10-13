# VitonlineRouter — Deep Code Audit Report

**Auditor role:** Senior software architect (code correctness, security, reliability)
**Date:** 13 October 2026
**Repository:** `C:/Users/HUAWEI/VitonlineRouter`
**Revision audited:** working tree as of 13 Oct 2026 (root `vitonlinerouter-app` v1.0.0 + `cli/` launcher)
**Scope:** ~35,000 lines of first-party JavaScript across `custom-server.js`, `src/`, `open-sse/`, `cli/src/`, `scripts/`
**Method:** six parallel specialist passes with a strict evidence standard (every finding must cite `file:line`, quote the code, state a concrete failure scenario, and be re-verified against the current file before reporting). The seven most severe findings were independently re-checked by the lead auditor by reading the code directly.
**Findings:** **1 Critical · 24 High · 17 Medium · 25 Low = 67 total**

---

## 1. Executive summary

VitonlineRouter is a well-structured codebase — the provider-agnostic engine boundary (`open-sse/`) is real, the translator registration is complete, the API-key auth path is fundamentally sound (exact SQL match, no empty-key fallback, unspoofable peer identity in production), and several subsystems (the kiro EventStream parser, the SSRF guard module, the sql.js adapter's transaction discipline) are genuinely well built. The audit found **no systemic "this project is broken" defect** — the failures are concentrated in *error paths*, *timeouts*, *crash recovery*, and *trust boundaries*, which is a very fixable profile.

That said, the risk profile is dominated by three things:

1. **One unauthenticated remote DoS that kills the whole gateway.** `custom-server.js` handles HTTP/2 cleartext (`h2c`) upgrades itself and attaches no `socket.on("error")` on that path. A partial-body request followed by a TCP reset raises an unhandled `ECONNRESET`; the server process has no `uncaughtException` handler, so **the process exits**. No auth, no rate limit, one packet sequence. This is the single most important fix in the report.

2. **Local-privilege and trust-boundary failures in the MITM layer.** The root CA **private key** is written world-readable (`0644`) into the data dir while the same CA is installed into the system trust store, and the sudo password is persisted "encrypted" with a key any local process can recompute (`machineId + hardcoded salt`). Both turn "any local process/user" into full TLS interception and root escalation.

3. **Error paths that convert a transient upstream blip into an outage.** A failed token refresh is cached and replayed for 10 s; the account-fallback loop retries with zero delay and no cap and writes a cooldown onto *every* account on any 5xx; refresh fetches have no timeout and are serialized behind a credential lock. Together these mean a single provider hiccup can lock all accounts for two minutes and stall the gateway.

The persistence layer adds a fourth theme: on the `sql.js` fallback (the machines least able to recover), the pre-migration "safety backup" is a **silent no-op**, `persist()` is non-atomic (crash mid-write → unrecoverable corrupt DB), and on Windows an upgrade silently starts empty because the legacy `~/.vitonlinerouter` home is never probed.

**Verdict:** safe for local, single-user, trusted-network use today. **Not** safe to expose on a LAN, a tunnel, or a 0.0.0.0 bind until at least the Critical and the High items in §6 are addressed.

---

## 2. Methodology and scope

### 2.1 How the audit was performed
The codebase was divided into six non-overlapping remits and each was audited by a dedicated pass:

| Pass | Remit | Files |
|------|-------|-------|
| A | Gateway entry | `custom-server.js`, `src/sse/**`, `next.config.mjs` |
| B | Auth, secrets, MITM | `src/app/api/auth/**`, `src/lib/auth/**`, `src/lib/oauth/**`, `src/mitm/**`, `src/lib/mimoLoginSession.js` |
| C | Engine core | `open-sse/handlers/**`, `services/{combo,tokenRefresh,modelRenames}.js`, `utils/stream.js` |
| D | Executors & binary upstreams | `open-sse/executors/**`, `open-sse/utils/cursorProtobuf.js` |
| E | Persistence | `src/lib/db/**`, `src/lib/localDb.js`, `src/lib/usageDb.js`, `src/lib/dataDir.js` |
| F | CLI, scripts, translator, RTK | `cli/**`, `scripts/**`, `open-sse/translator/**`, `open-sse/rtk/**` |

### 2.2 Evidence standard
Every reported finding satisfies all of:
- **Location** — exact `file:line`.
- **Code** — the faulty lines quoted.
- **Failure** — a concrete input → wrong-behaviour scenario (not "this could be risky").
- **Severity** — Critical / High / Medium / Low by exploitability × impact × reachability.
- **Fix** — a minimal, concrete change.

Anything that could not be tied to a demonstrable failure mode was dropped rather than reported. A "verified-clean" list (§7) records what was actively checked and found sound, so the absence of a finding is meaningful.

### 2.3 What was **not** covered
- **No live upstream calls** were made. Failure scenarios are reasoning traces over the quoted code (a few were reproduced in isolation on Node v22.22.2, noted inline).
- **`cloud/` worker** — not in this repo; `tests/unit/embeddings.cloud.test.js` cannot run here.
- **Dashboard React components** — audited only where they feed security-relevant API calls; UI-state bugs were out of scope.
- **`open-sse/providers/registry/**`** — skimmed for policy consistency, not deeply audited.
- **Dependency CVEs** — `npm audit` was not part of this pass; `dependency-audit.json` exists in-repo from a prior run.
- **Concurrency at OS scale** — the two-process `sql.js` overwrite (M-9) was reasoned from mechanism, not executed.

### 2.4 Severity rubric
| Severity | Meaning |
|----------|---------|
| **Critical** | Unauthenticated remote crash/compromise, or silent irreversible data loss, reachable in a default deployment |
| **High** | Auth bypass, credential/key disclosure, remote DoS, or data corruption requiring a specific but realistic condition |
| **Medium** | Correctness bug producing wrong results, resource leak, or weakness needing a less common condition |
| **Low** | Hardening, correctness edge cases, documentation/behaviour mismatch, bounded impact |

---

## 3. Findings index

Sorted by severity. IDs are stable references used in §4–§5 and §6.

| ID | Sev | Area | Location | Title |
|----|-----|------|----------|-------|
| C-1 | **Critical** | Gateway | `custom-server.js:110-119` | Unauthenticated h2c TCP-reset crashes the whole server process |
| H-1 | High | Gateway | `custom-server.js:64-65` | Leftmost XFF trusted from loopback proxy → login-lockout bypass |
| H-2 | High | Gateway | `custom-server.js:110-119` | h2c body-wait phase has no timeout → zombie socket / FD leak |
| H-3 | High | MITM | `src/mitm/cert/rootCA.js:89` | Root CA **private key** written world-readable (0644) |
| H-4 | High | MITM | `src/mitm/manager.js:155-185` | Sudo password persisted under a key any local process can recompute |
| H-5 | High | MITM | `src/mitm/server.js:164,197,259` | Upstream TLS verification disabled (`rejectUnauthorized:false`) |
| H-6 | High | Engine | `open-sse/handlers/chatCore.js:428-435` | Reactive 401 refresh bypasses the in-flight lock → rotating RT burned |
| H-7 | High | Engine | `open-sse/services/tokenRefresh/dedup.js:19-24` | Failed refresh result cached and replayed for 10 s |
| H-8 | High | Engine | `open-sse/services/tokenRefresh/providers.js` (8 sites) | No timeout on any token-refresh fetch → gateway-wide stall |
| H-9 | High | Engine | `src/sse/handlers/chat.js:275,382-389` | Account-fallback loop unbounded, zero delay, locks every account on 5xx |
| H-10 | High | Executors | `open-sse/utils/cursorProtobuf.js:677-719` | Unbounded varint → negative LEN length → infinite loop (event-loop hang) |
| H-11 | High | Executors | `open-sse/executors/codex.js:243,413` | `_isCompact` read one request stale (singleton) → wrong endpoint |
| H-12 | High | Executors | `open-sse/executors/cursor.js:183-185` | `gunzipSync` with no output cap → decompression-bomb OOM |
| H-13 | High | Persistence | `src/lib/db/adapters/sqljsAdapter.js:24-28` | Non-atomic `persist()` → corrupt DB with no recovery path |
| H-14 | High | Persistence | `src/lib/db/backup.js:39-63` | sql.js "safety backup" is a silent no-op (ATTACH is in-memory) |
| H-15 | High | Persistence | `src/lib/db/migrate.js:256-263` | Legacy `~/.vitonlinerouter` never probed → Windows upgrade starts empty |
| H-16 | High | CLI | `cli/cli.js:113,545-547,840-874` | EADDRINUSE becomes an infinite crash loop; `MAX_PORT_ATTEMPTS` dead code |
| H-17 | High | CLI | `cli/cli.js:846-853` | Crash-recovery writes the legacy `db.json` the server no longer reads |
| H-18 | High | CLI | `cli/src/cli/utils/input.js:141` | Ctrl-C in the TUI skips cleanup → orphaned detached server |
| H-19 | High | CLI | `cli/src/cli/menus/providers.js:623,630` + `api/client.js:120-132` | Device-code poll can report false success and stop polling |
| H-20 | High | CLI | `cli/src/cli/utils/endpoint.js:14-18` | Tunnel status read from wrong nesting → remote clients pointed at localhost |
| H-21 | High | SSRF | `src/app/api/providers/validate/route.js:403` | `ollama-local` baseUrl taken raw from request body, fetched unguarded |
| H-22 | High | SSRF | `src/app/api/providers/validate/route.js:232-244` | `azureEndpoint` taken raw from request body, fetched unguarded |
| H-23 | High | Translator | `open-sse/translator/response/openai-responses.js:332-378` | Tool calls with no upstream `id` silently dropped (Codex sees zero tools) |
| H-24 | High | Translator | `open-sse/translator/response/openai-to-claude.js:183-211` | Tool block opens only on `tc.id`; name never patched → lost/nameless tools |
| M-1 | Medium | Auth | `src/lib/auth/saml.js:102,150-158` + `saml/acs/route.js:30` | SAML `InResponseTo` skipped when cookie absent → login-CSRF/replay |
| M-2 | Medium | Engine | `open-sse/utils/stream.js:235-241,408-412` | Passthrough emits a duplicate `data: [DONE]` |
| M-3 | Medium | Engine | `open-sse/services/combo.js:576-590` | Fusion fan-out mutates one shared body across parallel panel calls |
| M-4 | Medium | Engine | `src/sse/handlers/chat.js:239-250` | Alias→combo re-entry drops the abort signal |
| M-5 | Medium | SSRF | `src/sse/handlers/fetch.js:84-89` | SSRF guard validates only the initial URL; core fetch follows redirects |
| M-6 | Medium | Executors | `cursor.js:379-391`, `codex.js:338`, `qoder.js:369`, `windsurf.js:514`, `perplexity-web.js:110` | Reads/fetches with no timeout (only kiro implements one) |
| M-7 | Medium | Executors | `cursor.js:172` + `cursorProtobuf.js:931-934` | `Buffer.from(non-bytes)` throws → mid-stream error / 500 |
| M-8 | Medium | Executors | `cursor.js:868,586-593` | Raw upstream error body echoed verbatim to the client |
| M-9 | Medium | Persistence | `src/lib/db/adapters/sqljsAdapter.js:13-39` | No cross-process serialization → whole-file last-write-wins |
| M-10 | Medium | Persistence | `src/lib/db/repos/usageRepo.js:585-586` | 24h/today stats drop the `input_tokens` fallback → divergent totals |
| M-11 | Medium | API | `src/app/api/providers/validate/route.js:657` (+341,355,373,432,480) | Upstream 5xx treated as "key valid" |
| M-12 | Medium | API | `src/dashboardGuard.js:38` + `next.config.mjs:79-81` | `/systemone` bypasses the middleware API-key gate |
| M-13 | Medium | API | `src/dashboardGuard.js:117-119` | Dev-mode `Host` header spoof grants `isLocalRequest` |
| M-14 | Medium | API | `src/sse/services/auth.js:348-362` | Handler key extraction narrower than middleware (`x-goog-api-key`/`?key=` 401) |
| M-15 | Medium | API | `src/sse/services/auth.js:244-292` | No rate limiting on `/v1`; one key degrades all users |
| M-16 | Medium | RTK | `open-sse/rtk/filters/dedupLog.js:13` + `autodetect.js:66` | `dedupLog` collapses repeated lines → corrupts JSON tool results |
| M-17 | Medium | Scripts | `scripts/launch.mjs:93-99` | No `cli.on("error")`; wrapper swallows all termination signals |
| L-1 | Low | Docs | `.env.example:19` | `REQUIRE_API_KEY` documented but never implemented |
| L-2 | Low | Auth | `login/route.js:110`, `oidc/test:82`, `saml/acs:66` | Raw internal `error.message` returned to clients |
| L-3 | Low | MITM | `src/mitm/logger.js:59-99` | Dev dumps capture `Authorization` headers at default perms |
| L-4 | Low | Auth | `src/lib/auth/oidc.js:32-38`, `saml.js:76-82` | Origin derived from client-controlled `X-Forwarded-Host` |
| L-5 | Low | Gateway | `custom-server.js:57` | Non-TCP listeners (unix socket/pipe) lose peer identity |
| L-6 | Low | Gateway | `custom-server.js:31-39` | Shutdown hooks only on import success; no connection drain |
| L-7 | Low | Gateway | `next.config.mjs:10` | 128 MB default body, no admission control |
| L-8 | Low | Engine | `open-sse/services/modelRenames.js:89` | `rewriteSseLine` regex cannot match CRLF → rename leaks |
| L-9 | Low | Engine | `open-sse/services/combo.js:599-627` | `answers.length === 1` re-issues the whole request |
| L-10 | Low | Persistence | `src/lib/db/migrate.js:34-37` | `importWithAssertion` counts all rows, not inserted rows |
| L-11 | Low | Persistence | `src/lib/dataDir.js:31-37` | Relative `DATA_DIR` not resolved → DB location depends on cwd |
| L-12 | Low | Persistence | `src/lib/db/repos/requestDetailsRepo.js:211-228` | Async flush on synchronous `exit` event → data loss |
| L-13 | Low | Persistence | `src/lib/db/adapters/sqljsAdapter.js:111-112` | SIGINT/SIGTERM don't terminate the process (sql.js) |
| L-14 | Low | Persistence | `src/lib/db/driver.js:82` | Failed init promise cached permanently |
| L-15 | Low | Persistence | `src/lib/db/repos/usageRepo.js:177` | Pending-request timers not unref'd |
| L-16 | Low | Docs | `CLAUDE.md:94`, `docs/ARCHITECTURE.md:147-148,545` | Persistence claim inverted (usage is now SQLite and follows DATA_DIR) |
| L-17 | Low | Executors | `open-sse/executors/cursor.js:443-446` | Abort listener never removed on the http2 path |
| L-18 | Low | Executors | `open-sse/executors/cursor.js:390` | Bypass shim lacks `arrayBuffer()` → TypeError on MITM-bypass host |
| L-19 | Low | Executors | `open-sse/executors/windsurf.js:225-235` | Unbounded `readVarint` → silent field truncation |
| L-20 | Low | Executors | `kiro.js:459-463`, `base.js:155,173`, `chatCore.js:443` | Non-idempotent chat POSTs re-sent on retry (double-billing surface) |
| L-21 | Low | RTK | `open-sse/rtk/index.js:67,103` | Error-skip matches only strict `is_error === true` / `status === "error"` |
| L-22 | Low | API | `src/app/api/v1beta/models/[...path]/route.js:85,117-123` | Unguarded `request.json()` → 500 + internal parser text |
| L-23 | Low | API | `src/dashboardGuard.js:19` | CLI token comparison not constant-time |
| L-24 | Low | Engine | `open-sse/handlers/chatCore.js:443-459` | Post-refresh retry failure swallowed into the original 401 |
| L-25 | Low | Engine | `open-sse/utils/stream.js:90-114` | Empty/aborted streams recorded as success in usage/logs |

---

## 4. Critical finding

### C-1 — Unauthenticated h2c TCP-reset crashes the entire server process

**Location:** `custom-server.js:110-119`
**Severity:** Critical — remote, unauthenticated, no preconditions, full gateway outage
**Verification:** confirmed by the lead auditor by reading the code path; the underlying Node behaviour (no `socketOnError` after `'upgrade'`; `ECONNRESET` → unhandled `'error'`) was reproduced in isolation on Node v22.22.2.

```js
// custom-server.js:110-119
    if (received >= contentLength) serve();
    else {
      socket.on("data", function readBody(chunk) {
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.off("data", readBody);
        serve();
      });
      socket.resume();
    }
```

**Why it is a bug.** `server.emit` is overridden (line 81) to intercept `Upgrade: h2c` requests so JetBrains-25-style clients that send h2c upgrades are downgraded to HTTP/1.1 instead of being closed. The interception path takes over the raw socket, but:

1. When Node emits `'upgrade'`, it **removes the HTTP server's own `socketOnError` listener** — from that moment the socket has zero `'error'` handlers. The h2c branch attaches `'data'` but never `'error'`.
2. `custom-server.js` registers **no `uncaughtException` handler** (the only one in the repo is `cli/cli.js:666`, in the *launcher* process, not this server process).
3. Therefore an `ECONNRESET` on that socket surfaces as an unhandled `'error'` event → `uncaughtException` → **process exit**.

**Failure scenario (minimal, no credentials):**
```
POST /v1/chat/completions HTTP/1.1
Host: <gateway>
Connection: Upgrade
Upgrade: h2c
Content-Length: 10

<send 2 bytes, then TCP RST>
```
The request never reaches auth, the rate limiter, or any handler. The socket enters the wait phase (line 110), the peer resets, `ECONNRESET` is emitted with no listener, and the gateway process dies — taking down the dashboard, all `/v1` traffic, and every in-flight stream. Trivially repeatable in a loop. The same exposure exists after `res.assignSocket(socket)` (line 102) while the response is in flight, since the socket still has no error handler.

**Fix (minimal):**
```js
// at the top of the h2c branch, before any wait:
socket.on("error", () => socket.destroy());
// and guard the response socket too:
res.on("error", () => socket.destroy());
```
Additionally, register a process-level safety net in the server entry (`process.on("uncaughtException", ...)` that logs and, for socket errors, continues) so no single connection can ever take the process down again.

**Notes.** This is a *distinct* defect from H-2 (missing timeout) even though it lives in the same branch: H-2 leaks FDs slowly, C-1 kills the process instantly. Fix them together.

---

## 5. High-severity findings

### 5.1 Gateway / server (`custom-server.js`)

#### H-1 — Leftmost `X-Forwarded-For` element is trusted from a loopback proxy

**Location:** `custom-server.js:64-65`
**Verification:** confirmed by reading; the repo's own test (`tests/unit/custom-server-peer-headers.test.js:63-69`) currently encodes the leftmost behaviour as *intended*, so the test must change with the fix.

```js
const proxyIp = xRealIp || (xff ? String(xff).split(",")[0].trim() : "");
const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
```

**Why it is a bug.** The wrapper's whole purpose is to make the client IP unspoofable, and it does that correctly for direct peers (line 61 gates on the TCP peer). But when the TCP peer *is* a loopback reverse proxy, it adopts the **leftmost** XFF entry — which is the value the *client* supplied. The default configuration of the reverse proxies this code explicitly supports (`nginx`'s `$proxy_add_x_forwarded_for`, Caddy, frp, cloudflared-local) **appends** the observed address to whatever the client sent, producing `6.6.6.6, <real-ip>`. The wrapper then stamps `6.6.6.6` into `x-vr-real-ip` and signs it with the unguessable peer token, so downstream consumers trust it completely.

**Failure scenario.** A remote attacker sends `X-Forwarded-For: 6.6.6.6` through the loopback proxy. `loginLimiter.getClientIp` (`src/lib/auth/loginLimiter.js:52-55`) buckets the attempt under `6.6.6.6`; rotating the header defeats the 5-failure lockout (`src/app/api/auth/login/route.js:24-28`) → **unlimited dashboard password brute-force**. `dashboardGuard.isLoopbackPeer` (`src/dashboardGuard.js:112-114`) and request logs are poisoned by the same mechanism.

**Fix.** When only XFF is available, take the **rightmost** entry (the address the loopback proxy itself observed); keep preferring `x-real-ip`. Update the test to assert the rightmost value survives a spoofed prefix chain.

#### H-2 — h2c body-wait phase has no timeout

**Location:** `custom-server.js:110-119`
**Verification:** confirmed; a test server with `requestTimeout: 3000` was observed to keep a stalled post-upgrade socket open past 5 s — Node's request timeout does not apply once the socket is detached from the normal request lifecycle.

Only a `'data'` listener is attached. There is no `'end'`, `'close'`, `'timeout'` handler and no `socket.setTimeout`.

**Failure scenario.** `Upgrade: h2c` + `Content-Length: 100`, write 10 bytes, then idle (or half-close). `readBody` never reaches `serve()`, the socket is never destroyed, and every Node timeout check is bypassed. Repeat N times → FD + memory exhaustion → gateway dies (slower than C-1, equally unauthenticated).

**Fix.** In the h2c branch: `socket.setTimeout(60_000)` with `socket.on("timeout", () => socket.destroy())`, plus `socket.on("end", () => socket.destroy())` for the half-close case.

### 5.2 MITM / credentials

#### H-3 — Root CA private key written world-readable

**Location:** `src/mitm/cert/rootCA.js:89`
**Verification:** confirmed by reading; the codebase's own standard elsewhere is `{ mode: 0o600 }` (`src/lib/dashboardSession.js:20`, `src/lib/machineId.js:29,44`) — this path missed it.

```js
fs.writeFileSync(ROOT_CA_KEY_PATH, privateKeyPem);   // no mode → 0666 & ~umask → typically 0644
fs.writeFileSync(ROOT_CA_CERT_PATH, certPem);
```

**Failure scenario.** `MITM_DIR` is `~/.vitonlinerouter/mitm` (POSIX) / `%APPDATA%\<slug>\mitm` (Windows). On Linux/macOS the key lands `0644`. The *same* CA is auto-installed into the system trust store (`src/mitm/cert/install.js`). Any local unprivileged user or process reads `rootCA.key` and signs a leaf certificate for `*.google.com` or a bank host that every TLS client on the machine trusts → full TLS interception of the very traffic the MITM exists to capture. Windows ACLs mitigate; the shipped Docker/Linux path does not.

**Fix.** `fs.writeFileSync(ROOT_CA_KEY_PATH, privateKeyPem, { mode: 0o600 })`, re-assert permissions on load (`fs.chmodSync(..., 0o600)`, since a regenerated-in-place file keeps its old mode), and create `MITM_DIR` with `0o700`.

#### H-4 — Sudo password persisted under a recomputable key

**Location:** `src/mitm/manager.js:155-185` (key derivation), `:199` (storage)
**Verification:** confirmed by reading.

```js
function deriveKey() {
  const { machineIdSync } = require("node-machine-id");
  const raw = machineIdSync();
  return crypto.createHash("sha256").update(raw + ENCRYPT_SALT).digest(); // ENCRYPT_SALT = "vitonlinerouter-mitm-pwd" (line 99)
}
...
if (password) updates.mitmSudoEncrypted = encryptPassword(password); // stored in the settings table
```

**Failure scenario.** `machineIdSync()` is **not a secret** — it is a stable host identifier readable by any local process (`node -p "require('node-machine-id').machineIdSync()"`), and `ENCRYPT_SALT` is a hardcoded string in the bundle. The AES-GCM construction is correct; the *key* is not. Any code running as the user — a malicious npm postinstall, another local account if the data dir is `0755`, a backup sync, a bug-report dump — recovers the plaintext sudo password, which is very likely the user's account password and reused on remote hosts → escalation from "local file read" to root and to unrelated systems.

**Fix.** Stop persisting the sudo password. Use an OS keychain (macOS Keychain / Windows Credential Manager / Secret Service), or require re-entry per privileged action with an in-memory-only cache. If persistence is unavoidable, it must be documented as reversible by any same-host reader — it currently reads as if protected.

#### H-5 — Upstream TLS verification disabled

**Location:** `src/mitm/server.js:164`, `:197`, `:259`
**Verification:** confirmed by reading all three call sites.

```js
tls.connect({ host: ip, port: 443, servername: host, ALPNProtocols: [...], rejectUnauthorized: false }, ...)   // :164
createConnection: () => tls.connect({ host: targetIP, port: 443, servername: targetHost, ALPNProtocols: ["h2"], rejectUnauthorized: false })   // :197
https.request({ hostname: targetIP, port: 443, path: req.url, ..., servername: targetHost, rejectUnauthorized: false })   // :259
```

**Failure scenario.** The proxy terminates the IDE's TLS with its own generated cert and re-originates TLS upstream. With `rejectUnauthorized: false`, an on-path attacker — or anyone who can answer the hardcoded `8.8.8.8` DNS query at `server.js:83` (rogue AP, router compromise, DNS hijack) — presents a self-signed cert for e.g. `api.anthropic.com` and receives the full request including the IDE's `Authorization: Bearer …` headers. This defeats the entire trust model the local CA was installed for.

**Fix.** `rejectUnauthorized: true` in all three places (`servername` is already set correctly). The local CA install is for *client-side* trust; upstream verification is independent and must stay on.

### 5.3 Engine core (`open-sse`)

#### H-6 — Reactive 401 refresh bypasses the in-flight lock

**Location:** `open-sse/handlers/chatCore.js:428-435`
**Verification:** confirmed by reading; the surrounding `refreshWithRetry` and `DefaultExecutor.refreshCredentials` (`open-sse/executors/default.js:243-292`) paths were traced by the engine pass.

```js
const newCredentials = await refreshWithRetry(async () => {
  const result = await executor.refreshCredentials(credentials, log);
  ...
}, 3, log);
```

`refreshWithRetry` retries 3× but performs **no** dedup of concurrent callers. `DefaultExecutor.refreshCredentials` routes to `refreshWithForm`/`refreshWithJSON`, which are a raw `proxyAwareFetch` — no `withCredentialRefreshLock` (`open-sse/services/oauthCredentialManager.js:134-147`), no `dedupRefresh`, **no `signal`**.

**Failure scenario.** `getProviderCredentials` returns `expiresAt: connection.expiresAt` (`src/sse/services/auth.js:209`). When that field is absent/null (common for imported/cline/kiro-external-idp connections), `shouldRefreshCredentials` (`oauthCredentialManager.js:48-51`) returns `false` forever → `checkAndRefreshToken` never proactively refreshes → every request goes upstream with a stale token and 401s. Five parallel requests then fire five independent refresh POSTs with the *same* refresh token. Providers that rotate the RT on use (Anthropic, OpenAI, Google) invalidate it on the first success, so the other four get `400 invalid_grant` and are marked unavailable → re-auth required.

**Fix.** Pass the `proxyOptions` already in scope (`chatCore.js:336`) into `executor.refreshCredentials(credentials, log, proxyOptions)`, and wrap the callback in `withCredentialRefreshLock(provider, credentials, …)`.

#### H-7 — Failed refresh results are cached and replayed for 10 s

**Location:** `open-sse/services/tokenRefresh/dedup.js:19-24`
**Verification:** confirmed by reading — the cache `set` is unconditional.

```js
const promise = (async () => {
  try {
    const result = await fn();
    refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });  // caches null too
    return result;
  } catch (err) { refreshDedupCache.delete(key); throw err; }
})();
```

`fn()` returns `null` (not a throw) on any non-2xx (`providers.js:118,175,223,291,439,541,550,599,651`). A `null` is therefore stored as a *successful* entry and handed to the next caller with the misleading log line `"Reusing recent refresh result"`.

**Failure scenario.** A token endpoint has a 30 s 500 blip. Request A at t=0 caches `null` until t=10 s. Requests B…Z in that window short-circuit to `null` → `chatCore` logs "refresh failed" → 401 → `markAccountUnavailable(401)` → `checkFallbackError` matches `{status: 401, cooldownMs: COOLDOWN.long}` (`errorConfig.js:71`) → `buildModelLockUpdate(model, 120000)` locks the connection for **2 minutes** on a perfectly healthy credential. With a multi-account combo every account locks in sequence and the request 503s while nothing is actually wrong.

**Fix.** Only cache truthy results: `if (result && !isUnrecoverableRefreshError(result)) refreshDedupCache.set(...); else refreshDedupCache.delete(key);`

#### H-8 — No timeout on any token-refresh fetch

**Location:** `open-sse/services/tokenRefresh/providers.js:110,155,206,261,472,519,569,630` and `tokenRefresh.js:101`
**Verification:** confirmed; the codebase's own correct pattern exists at `open-sse/handlers/search/chatSearch.js:476-477` (`AbortController` + `setTimeout`), and `proxyAwareFetch` adds no default timeout (`open-sse/utils/proxyFetch.js:294-357`).

```js
const response = await fetch(url, { method: "POST", headers, body });   // no signal
```

**Failure scenario.** A provider token endpoint accepts the connection and never responds, hanging `getAccessToken`/`refreshAccessToken` for up to undici's 300 s `headersTimeout` per caller. `refreshWithRetry` multiplies this ×3, and because the hang happens inside `withCredentialRefreshLock`, **all** requests for that provider serialize behind it — a gateway-wide stall, not one failed request. `dedupRefresh` makes every concurrent caller await the same hung promise.

**Fix.** `await fetch(url, { …, signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) })`, with `REFRESH_TIMEOUT_MS` added to `open-sse/config/runtimeConfig.js`.

#### H-9 — Account-fallback loop is unbounded, with zero inter-attempt delay

**Location:** `src/sse/handlers/chat.js:275`, `:382-389`
**Verification:** confirmed by reading; contrast `handleComboChat`'s bounded `maxAttempts`/`timeoutMs` (`open-sse/services/combo.js:286`).

```js
while (true) {
  ...
  if (shouldFallback) {
    excludeConnectionIds.add(credentials.connectionId);
    lastError = result.status; ...
    continue;                       // immediate next account, no sleep, no cap
  }
}
```

The loop terminates only when `getProviderCredentials` returns null (`src/sse/services/auth.js:115-139`) or `shouldFallback` is false — i.e. once per connection, back-to-back.

**Failure scenario.** A provider returns 500 for all models. `checkFallbackError(500, …)` matches no `ERROR_RULES` entry; its guard (`accountFallback.js:58`) only catches `4xx`, so it falls through to the default `{shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS}` (`accountFallback.js:63`). One client request therefore fires N sequential upstream POSTs in ~0 ms and writes a `modelLock_*` with a 30 s cooldown onto **every** connection (`auth.js:272-282`) — so the *next* request from any client 503s with "all N accounts locked" even though nothing is wrong.

**Fix.** Add an attempt counter with a `MAX_ACCOUNT_ATTEMPTS` cap and a small `await sleep(min(backoff, …))` before `continue`; treat 5xx as `{shouldFallback: true, cooldownMs: 0}` so a transient upstream error falls back for *this* request without persisting a lock on every account.

### 5.4 Executors

#### H-10 — Unbounded varint decode → negative length → infinite loop

**Location:** `open-sse/utils/cursorProtobuf.js:677-719` (decode), `:722-728` (loop)
**Verification:** confirmed by the lead auditor by reading; the int32-wraparound arithmetic was checked by hand.

```js
export function decodeVarint(buffer, offset) {
  let result = 0, shift = 0, pos = offset;
  while (pos < buffer.length) {
    const b = buffer[pos];
    result |= (b & 0x7F) << shift;      // :684 — no shift cap; `<<` is int32
    pos++;
    if (!(b & 0x80)) break;
    shift += 7;                          // :687 — unbounded
  }
  return [result, pos];
}
...
} else if (wireType === WIRE_TYPE.LEN) {
  const [length, pos2] = decodeVarint(buffer, pos);
  value = buffer.slice(pos2, pos2 + length);
  pos = pos2 + length;                   // :708 — no bounds check; negative length regresses pos
}
```

**Failure scenario.** A 5-byte length varint such as `80 80 80 80 08` yields `0x80000000`, which as an int32 is `-2147483648`. `pos = pos2 + length` then regresses to (or before) the field start, and `decodeMessage`'s `while (pos < data.length)` re-parses the same tag forever → **100 % CPU spin blocking the Node event loop → the entire gateway freezes for all users**. Reachable from `decodeMessage(payload)` on upstream frames (`cursor.js:634`, `:941`, `:1097`, and `extractTextFromResponse` at `:851`), i.e. from any malformed or hostile cursor upstream response. Truncated LEN values also silently clamp (silently wrong fields), and FIXED32/64 reads use unchecked `pos += 8/4`.

**Fix.** Cap the varint at 10 bytes with `shift < 64` (use multiplication or BigInt for 64-bit values); in `decodeField` reject `length < 0 || pos2 + length > buffer.length` by throwing; verify remaining bytes for FIXED32/64; treat wire types 3/4 (groups) as skip-to-matching-group or throw.

#### H-11 — `_isCompact` is read one request stale

**Location:** `open-sse/executors/codex.js:243` (read), `:413` (write)
**Verification:** confirmed by reading; the base loop order was verified in `open-sse/executors/base.js:128-129` (`buildUrl` then `transformRequest`), and executors are process-wide singletons (`open-sse/executors/index.js:31-66`).

```js
return this._isCompact ? `${base}/compact` : base;      // :243 buildUrl
...
this._isCompact = !!body._compact;                       // :413 transformRequest — runs AFTER buildUrl
```

**Failure scenario.** A normal request following any compact request reads the leftover `_isCompact = true` and POSTs to `/responses/compact` with a non-compact body; conversely a compact request reads `false` and compaction silently never happens. Wrong endpoint → upstream errors or unintended compaction.

**Fix.** Derive the flag inside `buildUrl` from the `body`/`credentials` arguments (or set `this._isCompact` in `execute()` before calling `super.execute`). Per-request state must not live on the singleton.

#### H-12 — `gunzipSync` with no decompressed-size cap

**Location:** `open-sse/executors/cursor.js:183-185` (agent frames), `:275-283` (legacy path)
**Verification:** confirmed by reading.

```js
if (flags & COMPRESS_FLAG.GZIP) { payload = zlib.gunzipSync(payload); }
```

**Failure scenario.** A frame with a ~1 MB gzip payload can expand to gigabytes (`gunzipSync` has no default output limit) and is fully materialized in `consume()` (`cursor.js:629-630`) → heap exhaustion / OOM kill of the gateway on a malicious or corrupted upstream response.

**Fix.** Pass `{ maxOutputLength: N }` to the sync inflate calls (or stream-inflate with a byte budget) and skip/error frames exceeding the budget.

### 5.5 Persistence

#### H-13 — Non-atomic `persist()` leaves a corrupt DB with no recovery

**Location:** `src/lib/db/adapters/sqljsAdapter.js:24-28`
**Verification:** confirmed by reading; the corruption behaviour was reproduced by the persistence pass (truncating a persisted DB to 60 % then reloading either loses tail pages or throws `database disk image is malformed`).

```js
function persist() {
  const data = db.export();
  fs.writeFileSync(filePath, Buffer.from(data));   // truncate-then-write, not atomic
  dirty = false;
}
```

**Failure scenario.** A kill / power loss / ENOSPC during the 100 ms-debounced write leaves a truncated file. On the next boot `new SQLLib.Database(buf)` throws → `trySqlJs` returns null (`driver.js:52-56`) → `initAdapter` throws `[DB] No SQLite driver available` (`driver.js:68`) → `getAdapter()` rejects → **the gateway and dashboard are dead on every boot**, with the corrupt file left in place and no quarantine/restore. Native adapters are immune (WAL).

**Fix.** `fs.writeFileSync(filePath + ".tmp", buf); fs.renameSync(filePath + ".tmp", filePath);` (rename is atomic same-volume on Windows and POSIX). At boot, wrap the initial `new SQLLib.Database(buf)` in try/catch: on failure move the file to `data.sqlite.corrupt-<ts>` and continue fresh with a loud error log.

#### H-14 — sql.js "safety backup" is a silent no-op

**Location:** `src/lib/db/backup.js:39-63`
**Verification:** confirmed by reading; runtime-verified against the repo's `sql.js@1.14.1` — `ATTACH` is accepted and rows are readable via `bak.*`, but after `DETACH` the destination file **does not exist on disk**.

```js
adapter.exec(`ATTACH DATABASE '${escaped}' AS bak`);
...
adapter.exec(`INSERT INTO bak.${t.name} SELECT * FROM main.${t.name}`);
```

**Failure scenario.** `backupDbLite` is the pre-schema-change safety net (`migrate.js:236-244`). Under sql.js (Node < 22.5 / no build tools — exactly the machines that fall back), ATTACH creates an *in-memory* schema, so the backup directory is empty while `migrate.js:240` logs the path as if a backup was taken. The only restore path for a botched migration is gone.

**Fix.** Branch on `adapter.driver === "sql.js"` → `fs.writeFileSync(dest, Buffer.from(adapter.raw.export()))`; for all adapters assert `fs.existsSync(dest) && fs.statSync(dest).size > 0` after backup and rethrow loudly if not.

#### H-15 — Legacy `~/.vitonlinerouter` home is never probed

**Location:** `src/lib/db/migrate.js:256-263`, `src/lib/db/paths.js:8-13`
**Verification:** confirmed by reading against the documented pre-`DATA_DIR` location (`CLAUDE.md:94`, `docs/ARCHITECTURE.md:141,147,381-382`).

```js
const legacyMain = readJsonSafe(LEGACY_FILES.main);   // path.join(DATA_DIR, "db.json")
...
if (fresh && hasLegacy && !alreadyImported) { /* import */ }   // silently skipped when !hasLegacy
```

**Failure scenario.** The historical home is `~/.vitonlinerouter` cross-platform. On Windows the new default is `%APPDATA%\vitonlinerouter` (`src/lib/dataDir.js:9-13`), so an upgrading Windows user's `C:\Users\X\.vitonlinerouter\{db.json,usage.json,request-details.json,disabledModels.json}` are invisible to the import → `hasLegacy` is false → **zero rows imported, no warning**, and the one-time `.migrated-from-json` marker is never even needed. Settings, provider connections, API keys and full usage history appear lost (state diverges while the files still exist on disk). On POSIX with `DATA_DIR` unset the paths coincide, which is why this only bites Windows.

**Fix.** In `runMigrationOnce`, also probe the historical home (`path.join(os.homedir(), ".<BRAND.slug>")`) as a legacy source; at minimum log a one-time warning when legacy files exist there and were not imported.

### 5.6 CLI launcher

#### H-16 — EADDRINUSE becomes an infinite crash loop

**Location:** `cli/cli.js:113` (`MAX_PORT_ATTEMPTS`, dead), `:545-547` (no `.catch()`), `:840-874` (`tryRestart`)
**Verification:** confirmed by reading.

```js
const MAX_PORT_ATTEMPTS = 10;              // :113 — never referenced again
killAllAppProcesses(port)
  .then(() => killProcessOnPort(port))
  .then(() => startServer(updatePromise)); // :545-547 — no .catch() on the chain
```

`killProcessOnPort` (`:396-441`) parses `netstat`, takes only `lines[0]` (`:410-412`), and swallows every kill failure. When the port is held by another user / an admin-owned / a protected process, the spawn succeeds and the Next standalone server dies with EADDRINUSE → `server.on("close")` (`:831`) → `tryRestart` (`:840`) → 2 restarts → the "disable MITM" branch → `restartCount = 0` (`:855`) → **infinite loop**.

**Failure scenario.** Start `vitonlinerouter -p 20128` while any non-`node.exe` process (or an admin-owned one) owns 20128 → crash loop at ~1 s / 1 s / 2 s backoff, forever, with only `Server exited (code=1)` shown. A synchronous throw anywhere in the 545-547 chain (e.g. the un-caught `setImmediate` block at `:257-261`) also becomes an unhandled rejection, because the `uncaughtException`/`unhandledRejection` handlers at `:666` only exist *after* `startServer` runs.

**Fix.** TCP-probe the port before spawn (the `waitServerReady` helper at `:12-28` already has this shape); on failure either walk to the next free port up to `MAX_PORT_ATTEMPTS` or exit with `Port 20128 is already in use (PID …)`; append `.catch((e) => { console.error(e); process.exit(1); })` to the chain.

#### H-17 — Crash recovery writes the legacy `db.json`

**Location:** `cli/cli.js:846-853`
**Verification:** confirmed by reading against `src/lib/db/paths.js:6` (`DATA_FILE = path.join(DATA_DIR, "db", "data.sqlite")`) and `CLAUDE.md` ("State is no longer `db.json`").

```js
const dbPath = path.join(os.homedir(), process.platform === "win32"
  ? path.join("AppData", "Roaming", BRAND.slug, "db.json") : path.join(`.${BRAND.slug}`, "db.json"));
if (fs.existsSync(dbPath)) { const db = JSON.parse(...); if (db.settings) db.settings.mitmEnabled = false; fs.writeFileSync(...) }
```

**Failure scenario.** The file never exists (`db.json` is only ever read by `migrate.js:18` as a one-shot import source), so `fs.existsSync` is always false, the MITM-disable recovery **silently never runs**, and if MITM is what is crashing the loop the loop repeats forever.

**Fix.** Flip the setting through the real store (write the `settings` row in `db/data.sqlite`), or have the server honour an env var such as `VITONLINEROUTER_DISABLE_MITM=1` that `spawnServer`'s env (`:622-626`) can set.

#### H-18 — Ctrl-C inside the TUI skips `cleanup()`

**Location:** `cli/src/cli/utils/input.js:141`
**Verification:** confirmed by reading.

```js
if (key.ctrl && key.name === "c") { cleanup(); process.exit(0); }
```

The local `cleanup()` (`:124-128`) only removes a keypress listener. Because raw mode is primed (`process.stdin.setRawMode(true)`, `:28`), ISIG is disabled and the terminal never raises SIGINT, so `cli.js`'s SIGINT handler (`:672-678`) — which calls `killProxyByPidFile`, `killTunnelByPidFile`, `killTray` and `process.kill(server.pid)` — is **unreachable while a menu is open**.

**Failure scenario.** The user presses Ctrl-C in the provider/model menu → process exits 0 → the detached Next server (spawned `detached: true`, `cli.js:619-627`) keeps running and holding the port, and cloudflared/tailscale and the MITM proxy keep running. The next launch then hits exactly the H-16 port-conflict loop.

**Fix.** Signal the parent instead of exiting: restore `setRawMode(false)` and emit the shutdown path (e.g. `process.emit("SIGINT")`) so the existing `:672-678` handler and its cleanup run.

#### H-19 — Device-code poll can report false success

**Location:** `cli/src/cli/menus/providers.js:623,630`, `cli/src/cli/api/client.js:120-132`
**Verification:** confirmed by reading, including the poll route (`src/app/api/oauth/[provider]/[action]/route.js:550-555`) and `src/lib/oauth/providers/index.js:207`.

```js
if (pollResult.success) { showStatus("\nConnection created successfully!", "success"); ... return; }   // providers.js:623
...
if (res.statusCode >= 400 || parsed.error) { ...success:false... } else { resolve({ success: true, ... }) }   // client.js:120-132
```

`makeRequest` never propagates body-level `pending` and treats HTTP 200 + no `error` key as success. The poll route returns HTTP **200** with `{success:false, error: undefined, pending:false}` whenever `pollForToken` fails without an error code (`src/lib/oauth/providers/index.js:207` — a non-ok upstream response with no `data.error`). JSON drops `undefined`, so the CLI sees `{success:false, pending:false}` → `success: true` → prints "Connection created successfully!" and returns, while `pollResult.pending` is permanently `undefined` (dropped by `makeRequest`), so the legitimate pending path depends solely on an exact error-string match.

**Failure scenario.** A GitHub/Qwen/Kiro device login where the token endpoint returns a non-ok status without an error code → the CLI claims success, no connection exists, and the user re-runs setup repeatedly.

**Fix.** Have `makeRequest` resolve `{ success: parsed.success !== false, data: parsed, pending: parsed.pending === true, error: parsed.error }`, and check `pending` before `success` in the poll loop.

#### H-20 — Tunnel status read from the wrong nesting

**Location:** `cli/src/cli/utils/endpoint.js:14-18` (and `terminalUI.js:45-51`)
**Verification:** confirmed by reading against the route (`src/app/api/tunnel/status/route.js:19-21` returns `{ ...probes, download }` where `probes = { tunnel, tailscale }`, i.e. fields live under `data.tunnel.*`; `src/lib/tunnel/cloudflare/manager.js:143-150`).

```js
const result = await api.getTunnelStatus();
const tunnelEnabled = result.success && result.data?.enabled === true;      // should be data.tunnel.enabled
const publicUrl = result.success ? result.data?.publicUrl : "";              // should be data.tunnel.publicUrl
```

**Failure scenario.** With a Cloudflare tunnel enabled and running, `getEndpoint()` always returns `http://localhost:<port>/v1`, so every "Quick Setup" in `menus/cliTools.js` writes `ANTHROPIC_BASE_URL` (`:89`) / Codex `baseUrl` (`:223`) pointing at localhost — unreachable from the remote client the tunnel exists for. `terminalUI.js:49-51` renders "Tunnel: OFF" permanently for the same reason.

**Fix.** Read `result.data?.tunnel?.enabled` / `result.data?.tunnel?.publicUrl`, and mirror the fix in `terminalUI.js:45-51`.

### 5.7 API surface — SSRF

#### H-21 — `ollama-local` baseUrl taken raw from the request body

**Location:** `src/app/api/providers/validate/route.js:403` (fetch at `:408`)
**Verification:** confirmed by the lead auditor by reading; `providerSpecificData` comes straight from the POST body (`:89`) and `resolveOllamaLocalHost` (`open-sse/config/providers.js:7-10`) returns `providerSpecificData.baseUrl` verbatim.

```js
"ollama-local": `${resolveOllamaLocalHost({ providerSpecificData })}/api/tags`,
...
const res = await fetch(endpoints[provider], { headers, signal: AbortSignal.timeout(8000) });
```

**Failure scenario.** An authenticated dashboard user POSTs `{"provider":"ollama-local","providerSpecificData":{"baseUrl":"http://169.254.169.254"}}` → the server fetches the cloud-metadata endpoint; `res.ok` becomes the `{valid}` oracle → blind SSRF + internal port scan. Reachable in practice because `INITIAL_PASSWORD` defaults to `123456` when not overridden (`CLAUDE.md:103`). DNS-rebinding hostnames work too.

**Fix.** Gate every body/DB-supplied URL through `assertPublicUrlResolved` / `fetchPublic` (`src/shared/utils/ssrfGuard.js`) before the fetch, mapping a rejection to 400. Note the residual TOCTOU (guard resolves, fetch resolves again) — worth a follow-up to pin the resolved IP.

#### H-22 — `azureEndpoint` taken raw from the request body

**Location:** `src/app/api/providers/validate/route.js:232-244`
**Verification:** confirmed by reading.

```js
const endpoint = (providerSpecificData?.azureEndpoint || "").replace(/\/$/, "");
const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
...
const azureRes = await fetch(url, { method: "POST", headers, body: ... });
```

**Failure scenario.** `{"provider":"azure","apiKey":"x","providerSpecificData":{"azureEndpoint":"http://10.0.0.5:8080"}}` → the server POSTs to arbitrary internal services with attacker-controlled body and an `api-key` header; the status-only response keeps it blind but confirms open ports/services. Same auth precondition as H-21.

**Fix.** `await assertPublicUrlResolved(url)` before the fetch; reject non-`https:` unless explicitly allowlisted.

### 5.8 Translator

#### H-23 — Tool calls with no upstream `id` are silently dropped (Codex)

**Location:** `open-sse/translator/response/openai-responses.js:332-378` (gates), `:382` (`closeToolCall`)
**Verification:** confirmed by reading; `fallbackToolCallId` is imported (`:9`) but used only in the *other* direction (`:569`).

```js
const callId = state.funcCallIds[tcIdx];                                       // :343 — only ever set from tc.id
if (!state.funcItemAdded[tcIdx] && callId && state.funcNames[tcIdx]) { ... }   // :344 — never true without id
...
if (state.funcItemAdded[tcIdx] && refCallId && !isCustomTool(...)) { emit(...) } // :365 — deltas gated too
```

**Failure scenario.** A provider that streams tool calls without `id` (common on vLLM/GLM/DeepSeek-compatible gateways, and on any pivot hop that loses the id) produces **no `response.output_item.added`, no argument deltas, no `function_call_arguments.done`, and no entry in `response.completed.output`**. The Codex client sees a finished turn with zero tool calls — it never retries, it just stops.

**Fix.** In `emitToolCall`, `const callId = tc.id || fallbackToolCallId(tcIdx);` and persist it in `state.funcCallIds[tcIdx]`.

#### H-24 — Tool block opens only on `tc.id`; name never patched

**Location:** `open-sse/translator/response/openai-to-claude.js:183-211`
**Verification:** confirmed by the lead auditor by reading.

```js
if (tc.id && !state.toolCalls.has(idx)) {
  ...
  state.toolCalls.set(idx, { id: tc.id, name: tc.function?.name || "", blockIndex: toolBlockIndex });
  let toolName = tc.function?.name || "";      // :196 — read only here, never patched later
```

Two failure modes:
(a) A provider that emits `id` in a *later* chunk than `name` → the block opens with `name: ""` and the name is never updated → the client emits a nameless `tool_use` (Claude Code fails with an unknown-tool error).
(b) A provider that never sends `id` → no block is opened at all and the buffered arguments (`:218`) are never attached → the tool call disappears entirely.

**Fix.** Open the block on the first chunk that has either `id` or `name` (`if ((tc.id || tc.function?.name) && !state.toolCalls.has(idx))`), and update `toolInfo.name` on later chunks when it arrives.

---

## 6. Medium-severity findings

### M-1 — SAML `InResponseTo` check silently skipped when the cookie is absent
**Location:** `src/lib/auth/saml.js:102,150-158` + `src/app/api/auth/saml/acs/route.js:30`

```js
validateInResponseTo: "never",          // saml.js:102
if (expectedRequestId) { ... throw ... } // :150-158 — only checked when truthy
const storedRequestId = cookieStore.get("saml_state")?.value || "";   // acs/route.js:30
```

ACS is a public endpoint (`PUBLIC_API_PATHS` includes `/api/auth/saml`) designed to receive cross-site POSTs. The `saml_state` cookie is `SameSite=Lax` (`saml/start/route.js:20`) — Lax cookies are **not sent** on cross-site POST. An attacker with any account on the IdP captures their own signed `SAMLResponse` and auto-submits it from `evil.com`; the victim's browser sends no cookie → `expectedRequestId === ""` → the manual check is skipped, and node-saml was told `validateInResponseTo: "never"` → signature/conditions/audience all pass → `setDashboardAuthCookie` issues a full dashboard JWT for the **attacker's** SSO identity (session-fixation-grade foothold). The OIDC callback does this correctly (`callback/route.js:38` rejects when `!storedState`).
**Fix.** Make a missing cookie a rejection (`if (!storedRequestId) throw …`); better, keep a server-side set of issued request IDs and consume them single-use.

### M-2 — Passthrough emits a duplicate `data: [DONE]`
**Location:** `open-sse/utils/stream.js:235-241` + `:408-412`

`streamDoneSent` is assigned only in the translate-mode branches (`:284,286`) and in `flush` (`:486`). In passthrough the upstream's own `[DONE]` passes through un-flagged, so `flush` appends a second one. Since `needsTranslation` is `sourceFormat !== targetFormat` (`translator/index.js:226-228`), the **most common path** (OpenAI client → OpenAI-compatible provider) runs passthrough → the client receives `data: [DONE]\n\ndata: [DONE]\n\n`. SDKs ignore it; raw `fetch` / `eventsource-parser` / logging proxies that re-parse the full body see a second terminal chunk.
**Fix.** Set `streamDoneSent = true` when a `[DONE]` line is forwarded in the passthrough branch.

### M-3 — Fusion fan-out mutates one shared body across parallel panel calls
**Location:** `open-sse/services/combo.js:576-590` + `open-sse/translator/concerns/modality.js:61-81`

`reserveSpend` returns a shallow copy (`spendControl.js:32`) and `chatCore` builds `body: {...spend.body, model}` (`src/sse/handlers/chat.js:317`), so the `messages` array and each message object are shared by reference. `stripUnsupportedModalities` then writes through (`msg.content = filterBlocks(msg.content, …)`, `modality.js:80`).
**Failure:** a fusion combo where model 1 lacks vision and models 2–3 have it, with an image in the trailing turn: model 1's call rewrites `msg.content` to a `[image omitted]` placeholder *while* models 2–3 serialise the same array → they send the placeholder instead of the image; the outcome depends on interleaving → non-deterministic wrong output, silent context truncation.
**Fix.** Deep-clone per panel call (`structuredClone(panelBody)`) inside `panel.map`, or move `stripUnsupportedModalities` after a per-attempt clone.

### M-4 — Alias→combo re-entry drops the abort signal
**Location:** `src/sse/handlers/chat.js:239-250` (also `:219-234`, `:126-141`)

The re-entry `handleComboChat` call omits `signal: request.signal`, unlike the primary path (`:146-159`). `handleComboChat` only checks `signal?.aborted` (`combo.js:308`) and `runComboAttempt` derives its abort source from the parent signal + `timeoutMs` (`comboDeadline.js:3,8`) — with `signal: undefined` and `timeoutMs` defaulting to `Infinity`, no timer and no abort exist. `handleFusionChat` takes no signal at all (`combo.js:556`).
**Failure:** model string is an alias whose target is a combo name → the request re-enters the combo loop without cancellation; a client disconnect leaves every remaining combo model's upstream call running to completion (each with its own `while(true)` account loop), burning quota and writing usage records. Same gap in `fetch.js:99`, `tts.js:54`, `imageGeneration.js:56`, `search.js:79`.
**Fix.** Pass `signal: request.signal` (and a `timeoutMs`) into the re-entry calls; thread a signal into `handleFusionChat`.

### M-5 — SSRF guard validates only the initial URL
**Location:** `src/sse/handlers/fetch.js:84-89`; core fetch at `open-sse/handlers/fetch/index.js:35`

`assertPublicUrlResolved(targetUrl)` is called once, but the core fetch is a plain `fetch(url, {...})` with default redirect-following (`fetchPublic` from `src/shared/utils/ssrfGuard.js:202` — which exists to close this class — is never used on this path).
**Failure:** `POST /v1/fetch` with `url: https://attacker.tld/r`; the attacker responds `302 Location: http://169.254.169.254/latest/meta-data/` → the guard passed on the first URL, the core fetch auto-follows into the internal target and returns the body to the caller.
**Fix.** Route the core fetch through `fetchPublic`, or set `redirect: "manual"` and re-validate each hop; pin the resolved IP for the actual fetch.

### M-6 — Reads/fetches with no timeout across executors
**Location:** `cursor.js:379-391`, `codex.js:338`, `qoder.js:369`, `windsurf.js:514`, `perplexity-web.js:110` (`proxyAwareFetch` adds none — `proxyFetch.js:356`; only kiro implements one — `kiro.js:85-102`, `cursor.js:418-420`).
**Failure:** an upstream that accepts headers then stalls hangs the client request indefinitely (no first-chunk/stall bound). One hung upstream pins the request until the client gives up.
**Fix.** Wrap `reader.read()` in a timeout race (kiro's `readWithTimeout` is the in-repo pattern) and/or `AbortSignal.timeout` on fetch.

### M-7 — `Buffer.from(non-bytes)` throws mid-stream
**Location:** `open-sse/executors/cursor.js:172` + `open-sse/utils/cursorProtobuf.js:931-934`
`Buffer.from(5)` throws `ERR_INVALID_ARG_TYPE`. If upstream sends a field as VARINT where LEN is expected (protocol change / malformed frame), the agent path rejects out of `consume()` → streaming clients get `controller.error` mid-stream (no `[DONE]`), non-streaming gets a 500 (`cursor.js:843-854`). Reachable via `decodeMcpArgs` (`cursor.js:690`).
**Fix.** Coerce defensively — treat non-`Buffer`/`Uint8Array` values as absent (`Buffer.alloc(0)`).

### M-8 — Raw upstream error body echoed to the client
**Location:** `open-sse/executors/cursor.js:868` (`:586-593`)
```js
const errorText = response.body?.toString() || "Unknown error";
message: `[${response.status}]: ${errorText}`,   // :871
```
Upstream error bodies can contain account identifiers or fragments of auth material; they are passed unsanitized into the client-visible error and logs. The file's own `createErrorResponse` (`:326-344`) shows the correct extraction pattern.
**Fix.** Route both paths through `createErrorResponse`-style field extraction; never echo the raw body.

### M-9 — No cross-process serialization on sql.js
**Location:** `src/lib/db/adapters/sqljsAdapter.js:13-39`
The DB is loaded into memory once (`:15`) and every mutation re-persists the **entire** image, debounced 100 ms. `PRAGMA busy_timeout` (`schema.js:15`) is a no-op on sql.js; there is no locking. Two processes sharing the file (packaged CLI + `npm run dev`, or two launches): instance B, which loaded before A's persist, later overwrites the file with its whole image → **reverts A's committed data with no error**. Native adapters serialize via WAL + busy_timeout.
**Fix.** Lockfile (`db/data.sqlite.lock`, flock-style) in the sql.js path, refusing to start (or opening read-only) when held; alternatively compare file mtime before each `persist()` and warn.

### M-10 — 24h/today token totals drop the `input_tokens` fallback
**Location:** `src/lib/db/repos/usageRepo.js:585-586`
The raw-history branch (used when `period === "24h" || "today"`) reads `tokens.prompt_tokens` / `tokens.completion_tokens` directly, while every other path applies the fallback `prompt_tokens || input_tokens` (`:66-67`, `:225-226`) — and `saveRequestUsage` normalizes both namings (`:257-258`). The omission is proven accidental by `cachedTokens` keeping its fallback on `:587`.
**Failure:** a provider reporting `input_tokens` renders 0 prompt tokens in the 24h/today view and correct counts in 7d/30d/all on the same data; legacy `usage.json` rows imported via `migrate.js:181` are affected too.
**Fix.** Use the normalized columns (`r.promptTokens`, `r.completionTokens`) or mirror the `:66-67` fallbacks.

### M-11 — Upstream 5xx treated as "key valid"
**Location:** `src/app/api/providers/validate/route.js:657` (same pattern at `:341,355,373,432,480`)
```js
isValid = chatRes.status !== 401 && chatRes.status !== 403;
```
During an upstream outage (500/502/503) a bad key is reported `{valid:true}` — the dashboard shows the connection healthy; conversely a transient upstream error masks a genuinely broken key.
**Fix.** Treat `>= 500` as `unknown` (`{valid:false, error:"upstream unavailable"}` with a distinct code); keep 401/403 as the only negative-auth signal.

### M-12 — `/systemone` bypasses the middleware API-key gate
**Location:** `src/dashboardGuard.js:38` + `next.config.mjs:79-81`
`PUBLIC_PREFIXES` lists `/v1`, `/v1beta`, `/api/v1`, `/api/v1beta`, `/codex`, `/responses` — but `/systemone` is rewritten to `/api/v1/systemone` (`next.config.mjs:79`) and is in neither list, so `proxy()` falls through to `NextResponse.next()` with zero gating. The only auth is the handler's own `if (settings.requireApiKey)` check (`src/sse/handlers/systemone.js:47-57`).
**Failure:** with the "Require API key" toggle OFF (`EndpointPageClient.js:979`), a remote client on a tunnel/0.0.0.0 bind POSTs `/systemone` with any model — no key — and consumes the user's provider accounts, while `/v1/*` still requires a key. Strictly weaker than every other LLM path.
**Fix.** Add `"/systemone"` to `PUBLIC_PREFIXES`, or move the public rewrite under `/v1`.

### M-13 — Dev-mode `Host` spoof grants `isLocalRequest`
**Location:** `src/dashboardGuard.js:117-119`
```js
if (process.env.NODE_ENV === "development") { return isLoopbackHostname(request.headers.get("host")); }
```
Production is correct (`custom-server.js:66-72` strips and re-stamps the peer headers; `npm start` loads it). But `next dev` never loads `custom-server.js` (see the comment at `custom-server.js:10-12`), so there is no peer token and the code trusts the client-supplied `Host`.
**Failure:** dev server bound beyond loopback (or fronted by a tunnel): `curl -H "Host: localhost" http://host:20127/v1/chat/completions` → `isLocalRequest` true → `canAccessPublicLlmApi` passes → unauthenticated use of gateway credentials.
**Fix.** Drop the `Host` fallback; when peer headers are absent, treat the request as remote, or positively verify the listening socket is loopback.

### M-14 — Handler key extraction narrower than the middleware's
**Location:** `src/sse/services/auth.js:348-362`
Handlers accept only `Bearer` + `x-api-key`; the middleware also accepts `x-goog-api-key` and `?key=` (`dashboardGuard.js:141-149`).
**Failure:** a Gemini-style client sends `x-goog-api-key: sk-…` → the middleware validates and passes → the handler sees `apiKey = null` → `401 "Missing API key"` despite a valid key. The v1beta native path reads all four forms, so the same client is accepted on one branch and 401'd on the converted branch.
**Fix.** Extract to one shared function for all handler-level `requireApiKey` checks.

### M-15 — No rate limiting on `/v1`; one key degrades all users
**Location:** `src/sse/services/auth.js:244-292`
`markAccountUnavailable` writes `modelLock_*` per upstream account; no limiter exists in `dashboardGuard.js` or any handler. One remote client with a valid key can flood `/v1/chat/completions`, and the resulting upstream 429/5xx marks shared upstream accounts unavailable for **all** clients (the model lock is per account, not per caller). `custom-server.js:57` already derives the real peer IP but it is unused for throttling.
**Fix.** Per-API-key and per-peer-IP token bucket at the middleware or handler entry; scope cooldown side effects so caller-induced errors don't blanket-lock shared accounts.

### M-16 — `dedupLog` collapses repeated lines, corrupting JSON tool results
**Location:** `open-sse/rtk/filters/dedupLog.js:13` + `open-sse/rtk/autodetect.js:66`
```js
if (nonEmpty.length >= 5) return dedupLog;      // autodetect.js:66 — no structure check
out.push(`  ... (${runCount - 1} duplicate lines)`);   // dedupLog.js:13
```
Every `tool_result` ≥ 500 chars with ≥ 5 non-empty lines and no recognised structure falls through to `dedupLog`. A JSON array of repeated records (`[{"ok":true},` × 100) is rewritten into **invalid JSON**, and the model then fails to parse the tool output. The RTK fail-open invariant itself holds (verified: the only `throw` in `open-sse/rtk/` is inside a comment; every filter goes through `safeApply`, `applyFilter.js:9-14`).
**Fix.** In `compressText` (`rtk/index.js:120`), skip compression when the text parses as JSON (`try { JSON.parse(text); return text; } catch {}`), or gate the `dedupLog` fallback on the first non-space char not being `{` or `[`.

### M-17 — `launch.mjs` has no `cli.on("error")` and swallows signals
**Location:** `scripts/launch.mjs:93-99`
```js
const cli = spawn(process.execPath, [...], { cwd: root, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => {});
cli.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));
```
If `cli/cli.js` is missing, `spawn` emits `'error'` (ENOENT) with no handler → raw stack trace, and `cli.on("exit")` never fires. The no-op signal handlers mean the wrapper can never terminate itself; if the child ignores SIGTERM (tray mode does exactly this for SIGHUP, `cli.js:714-715`), the wrapper hangs until SIGKILL.
**Fix.** Add `cli.on("error", (e) => { console.error(...); process.exit(1); })` and forward signals (or re-exit after a grace timeout).

---

## 7. Low-severity findings

| ID | Location | Issue | Fix |
|----|----------|-------|-----|
| L-1 | `.env.example:19` | `REQUIRE_API_KEY` documented but referenced nowhere in code; remote `/v1` gating is `isLocalRequest \|\| cliToken \|\| validApiKey` only (`dashboardGuard.js:157-161`) | Implement it in `canAccessPublicLlmApi`, or delete the phantom var; warn at startup on non-loopback bind without overrides |
| L-2 | `login/route.js:110`, `oidc/test/route.js:82`, `saml/acs/route.js:66` | Raw internal `error.message` returned to clients (DB driver/path errors, discovery URL) | Return a generic message; log detail server-side |
| L-3 | `src/mitm/logger.js:59-99` | Dev dumps write full headers (incl. `Authorization`) to `DATA_DIR/logs/mitm/*` at default perms; gated by `ENABLE_FILE_LOG = IS_DEV` (`server.js:17`) | `{ mode: 0o600 }` on the writes and the dump dir |
| L-4 | `src/lib/auth/oidc.js:32-38`, `saml.js:76-82` | Origin from client-controlled `X-Forwarded-Host` when `BASE_URL` unset (bounded: PKCE + IdP redirect-uri registration) | Fall back to `new URL(request.url).origin` |
| L-5 | `custom-server.js:57` | Non-TCP listeners (unix socket / named pipe) → `remoteAddress === undefined` → peer classified remote → local CLI/UI gets 401 | Treat a missing `remoteAddress` as loopback |
| L-6 | `custom-server.js:31-39` | SIGINT/SIGTERM hooks registered only inside the dynamic-import success path; no `server.close()` / drain | Register handlers outside the import chain; drain with a timeout |
| L-7 | `next.config.mjs:10` | 128 MB body default with no concurrency/admission control at the Node layer | Add a coarse per-connection/size admission check; bound the env override |
| L-8 | `open-sse/services/modelRenames.js:89` | `rewriteSseLine` regex `/^(data:\s?)(.*)$/` can't match CRLF (`.` excludes `\r`, no `m` flag) → rename silently no-ops, public model leaks | Add `\r?$` / use `[^\n]*` |
| L-9 | `open-sse/services/combo.js:599-627` | `answers.length === 1` re-issues the entire request after the panel already ran → doubled latency, no timeout on the second call | Return the single panel answer directly |
| L-10 | `src/lib/db/migrate.js:34-37` | `importWithAssertion` counts ALL table rows, not inserted rows → duplicate ids in legacy `db.json` throw `MigrationAborted` → every boot aborts | Count inside `insertFn`, or restrict the COUNT to imported ids |
| L-11 | `src/lib/dataDir.js:31-37` | Relative `DATA_DIR` not resolved → DB location depends on cwd → silent state split between CLI-spawned server and `npm run dev` | `return path.resolve(configured)` |
| L-12 | `src/lib/db/repos/requestDetailsRepo.js:211-228` | Async flush on synchronous `process.on("exit")` → up to 5 s of buffered records lost | Drop the `exit` listener (keep `beforeExit`) or make the flush sync |
| L-13 | `src/lib/db/adapters/sqljsAdapter.js:111-112` | SIGINT/SIGTERM flush but don't exit (unlike native adapters, `betterSqliteAdapter.js:38-39`) → Ctrl-C appears to hang | Add `process.exit(0)` after flush |
| L-14 | `src/lib/db/driver.js:82` | A rejected `initPromise` is cached permanently → every `getAdapter()` rejects until restart | On rejection, `state.initPromise = null` |
| L-15 | `src/lib/db/repos/usageRepo.js:177` | Pending-request timers not `unref`'d → up to 60 s delay of `beforeExit` flush | `pendingTimers[timerKey]?.unref?.()` |
| L-16 | `CLAUDE.md:94`, `docs/ARCHITECTURE.md:147-148,545` | Docs claim `usage.json`/`log.txt` live under `~/.vitonlinerouter` and don't follow `DATA_DIR` — inverted: `usageDb.js` is a SQLite shim, `appendRequestLog` is a no-op (`usageRepo.js:774-775`), no live writer of `usage.json` | Update the docs (and see H-15 for the real legacy-location bug this obscures) |
| L-17 | `open-sse/executors/cursor.js:443-446` | Abort listener never removed after the request settles (http2 path) | `signal.removeEventListener` inside `finish` |
| L-18 | `open-sse/executors/cursor.js:390` | Bypass shim (`proxyFetch.js:238-292`) has no `arrayBuffer()` and a `Map` headers object, ignores `options.signal` → TypeError / uncancellable on `api2.cursor.sh` (a `MITM_BYPASS_HOSTS` entry) | Give the shim an `arrayBuffer()`/Headers-compatible shape; wire the signal |
| L-19 | `open-sse/executors/windsurf.js:225-235` (also `:292-297,302`) | Unbounded `readVarint` → silently wrong field lengths on malformed gRPC-web frames (no crash; `slice` clamps) | Cap at 5 bytes / `shift < 35`; validate `offset + len <= buf.length` |
| L-20 | `kiro.js:459-463`, `base.js:155,173`, `chatCore.js:443` | Non-idempotent chat POSTs re-sent on retry → upstream may bill two generations while the client sees one | Add an idempotency key where the provider supports one; document the rest |
| L-21 | `open-sse/rtk/index.js:67,103` | Error-skip matches only strict `is_error === true` / `status === "error"`; OpenAI `role:"tool"` and Responses `function_call_output` shapes have no error check | `if (block.is_error)`, `if (tr.status === "error" \|\| tr.isError === true)`, skip error-marked function outputs |
| L-22 | `src/app/api/v1beta/models/[...path]/route.js:85,117-123` | Unguarded `request.json()` → 500 with the raw parser message instead of 400 | try/catch → 400 "Invalid JSON body"; static message in the outer catch |
| L-23 | `src/dashboardGuard.js:19` | CLI token compared with `===` (not constant-time) — gates `ALWAYS_PROTECTED`/`LOCAL_ONLY` routes | `crypto.timingSafeEqual` behind a length pre-check |
| L-24 | `open-sse/handlers/chatCore.js:443-459` | Only `ok` retry results replace the response; a non-ok/throwing retry leaves the stale 401 → client sees `401 Invalid API key` instead of the real 502/503, and a just-refreshed credential gets a 2-minute cooldown. `providerHeaders`/`finalBody` never updated for the retry (so `reqLogger` records the pre-refresh request); both bodies never read/cancelled | On failure return `createErrorResult(retryResult?.response?.status ?? 502, …)` after consuming both bodies; refresh the recorded headers/body on success |
| L-25 | `open-sse/utils/stream.js:90-114` | `finalizeStream` (called from `flush` *and* its `catch`) unconditionally writes `status: "200 OK"` / `"success"` → empty or aborted streams are indistinguishable from good completions in usage/logs/dashboard | Pass an outcome in: `status: accumulatedContent ? "success" : "empty"`; skip the `📊 done` line when nothing was produced |

---

## 8. Cross-cutting themes (architectural analysis)

The 67 findings are not 67 independent mistakes. They cluster into **six root causes**, and fixing the cause retires a whole class:

### T1 — "Happy path only": error paths are systematically under-specified
The most damaging defects are all in failure handling: C-1 (no socket `'error'`), H-6/H-7 (refresh failure semantics), H-9 (5xx treated as fallback-with-lock), H-13/H-14 (crash-during-write, backup that silently no-ops), L-24 (retry failure swallowed), L-25 (aborted stream logged as success).
**Architectural recommendation:** adopt an explicit *error taxonomy* — every I/O boundary (socket, fetch, DB write, child process) must declare (a) what happens on failure, (b) what the caller sees, (c) what is persisted. A short `docs/ERROR_MODEL.md` plus a lint rule for bare `catch {}` blocks would prevent recurrence. Note the codebase already has the right pattern in places (kiro's `readWithTimeout`, `createErrorResponse`, `safeApply`) — the problem is inconsistency, not absence.

### T2 — Missing timeouts and unbounded resource growth
H-2, H-8, H-12, M-6, L-7 all share one shape: an await/buffer with no ceiling. Only kiro and one cursor path implement timeouts.
**Recommendation:** one shared `withTimeout()` / `fetchWithTimeout()` helper, mandatory on every upstream call and stream read; a lint/review rule that no `fetch(` appears without a `signal`. Add `maxOutputLength` to all sync inflate calls and a global decompressed-size budget.

### T3 — Process-wide mutable singletons used for per-request state
H-11 (`codex._isCompact`) is the proven instance; the pattern (executors are singletons per `index.js:31-66`) means any future per-request field on an executor is a latent cross-request bug.
**Recommendation:** make executors stateless — all per-request state passed as arguments; add a test that interleaves a compact and a normal request.

### T4 — Trust boundaries that are correct in production but have an insecure fallback
H-1 (leftmost XFF), M-13 (dev Host), L-4 (`X-Forwarded-Host`), L-5 (non-TCP). Each has a "secure when configured correctly" path and a "trusts the client" fallback.
**Recommendation:** invert the default — *deny* when provenance cannot be proven, rather than falling back to client-supplied values. This is already the design intent (`x-vr-peer-token`); the fallbacks just need to fail closed.

### T5 — State migrations that are documented but not executed
H-15 (legacy home never probed), H-17 (recovery writes the dead `db.json`), L-16 (docs describe the old model), L-10. The `db.json → SQLite` migration left the *CLI* and the *docs* behind the *server*.
**Recommendation:** single source of truth for the data location (one exported resolver consumed by CLI, server, and docs); a startup self-check that warns when files exist at a legacy path.

### T6 — Credentials and keys with a weaker protection than they appear to have
H-3 (0644 CA key), H-4 (recomputable key), H-5 (TLS verification off), L-3 (headers in dumps), L-2 (error leaks).
**Recommendation:** a documented "secret at rest" policy — every secret file `0600` + `0700` dir (the code already does this in `dashboardSession.js`/`machineId.js`; enforce it uniformly), OS keychain for user passwords, and a rule that no upstream body is echoed verbatim to clients.

### What is *not* a problem (important for balance)
The auth model is sound: API-key validation is an exact SQL match with an active-flag check and no empty-key fallback; the `x-vr-peer-token` design genuinely prevents peer-identity spoofing in production; the JWT layer pins HS256 and rejects alg-confusion; OIDC uses state+nonce+PKCE with proper id_token verification. The translator registration is complete (all 12 request / 10 response translators imported). The kiro EventStream parser is bounds-checked and CRC-verified throughout. The sql.js adapter's *transaction* discipline is correct (every read-modify-write runs inside one sync transaction) — it is only *durability* and *cross-process* that fail.

---

## 9. Prioritized remediation plan

Ordered by (severity × ease). The P0/P1 items are the difference between "local tool" and "safe to expose".

### P0 — Fix before any non-local exposure (same day)
| # | Finding | Change | Effort |
|---|---------|--------|--------|
| 1 | **C-1** | Add `socket.on("error", …)` in the h2c branch + a process-level `uncaughtException` net | ~5 lines |
| 2 | **H-2** | `socket.setTimeout` + `'end'`/`'timeout'` destroy in the same branch | ~5 lines |
| 3 | **H-3** | `{ mode: 0o600 }` on the CA key write + chmod on load + `0o700` dir | ~3 lines |
| 4 | **H-5** | `rejectUnauthorized: true` ×3 | 3 edits |
| 5 | **H-4** | Stop persisting the sudo password (keychain or re-entry) | design change |
| 6 | **H-1** | Take the rightmost XFF entry; update the peer-headers test | ~2 lines + test |
| 7 | **H-21/H-22** | Route `ollama-local` + `azure` URLs through `assertPublicUrlResolved` | ~6 lines |
| 8 | **H-10** | Bound the varint (`shift < 64`) + reject negative/oversized LEN | ~10 lines |

### P1 — Reliability & data integrity (this week)
| # | Finding | Change |
|---|---------|--------|
| 9 | **H-13** | Atomic persist (tmp + rename) + corrupt-file quarantine on boot |
| 10 | **H-14** | Real sql.js backup (`db.export()`) + post-backup size assertion |
| 11 | **H-7** | Don't cache failed (`null`) refresh results |
| 12 | **H-8** | `AbortSignal.timeout` on all refresh fetches |
| 13 | **H-6** | Pass `proxyOptions`; wrap refresh in `withCredentialRefreshLock` |
| 14 | **H-9** | Cap account attempts + backoff; 5xx → `cooldownMs: 0` |
| 15 | **H-15** | Probe the legacy `~/.vitonlinerouter` home during migration |
| 16 | **H-12** | `maxOutputLength` on inflate calls |
| 17 | **H-23/H-24** | `fallbackToolCallId` in both translators; open the Claude block on id **or** name |
| 18 | **H-11** | Derive `_isCompact` per-request (no singleton state) |
| 19 | **M-1** | Reject SAML ACS when the state cookie is missing |
| 20 | **M-5** | Re-validate redirects (`fetchPublic` or `redirect: "manual"`) |
| 21 | **M-6** | Shared timeout helper across executors |
| 22 | **M-15** | Per-key / per-IP rate limit on `/v1` |

### P2 — CLI correctness & UX (next)
H-16, H-17, H-18, H-19, H-20 (crash loop, dead recovery path, orphaned server, false device-code success, tunnel URL) — these make the launcher unreliable rather than insecure. Fix as a batch; they share the "CLI is behind the server's data model" root cause (T5).

### P3 — Correctness polish & hardening
M-2, M-3, M-4, M-7, M-8, M-9, M-10, M-11, M-12, M-13, M-14, M-16, M-17, then the Low table. Notably: M-12 (`/systemone` gate) and M-13 (dev Host) are quick wins with real security value and belong in P1 if you expose the dashboard to a tunnel.

### Suggested verification gate for the fixes
The repo already has the right machinery — use it:
- `tests/__baseline__/verify-no-regression.mjs` after each batch (the suite is *expected* to be ~64 red; judge regressions, not a raw run).
- Add targeted tests: h2c RST (C-1), spoofed XFF chain (H-1), corrupt-DB boot (H-13), a tool call with no `id` (H-23/H-24), interleaved compact/normal (H-11).
- The two peer-trust suites (`tests/unit/custom-server-peer-headers.test.js`) must be updated alongside H-1 — they currently assert the vulnerable behaviour.

---

## 10. Verified-clean register

Explicitly checked and found sound (so their absence above is meaningful):

**Auth & secrets** — JWT pinned to HS256 with `jose.jwtVerify` rejecting `none`/alg-confusion; secret is env or an auto-generated 32-byte `0600` file; cookies `httpOnly` + `SameSite=Lax` + conditional `secure`; OIDC state/nonce/PKCE-S256 with issuer/audience/nonce verification and a correct missing-state rejection; remote login on the default `123456` refused pre-session with a must-change response; bcrypt hashes; login limiter keyed on the token-proven peer IP (XFF rotation cannot escape *unless* H-1 is exploited); API keys looked up by parameterized SQL; no `'use client'` file imports `@/lib/db`, `@/lib/oauth`, or `@/models`; no `NEXT_PUBLIC_` secret variables; the forged `9r_mimo_login` cookie is dropped without a valid dashboard session (`src/proxy.js:25-31`); `reset-password` is local-only-gated.

**Gateway** — the `x-vr-peer-token` proof-of-stamp design prevents peer-identity forgery (client cannot forge loopback/peer identity); XFF stripping is correct for direct/non-loopback peers; h2c `content-length` validation; WebSocket (non-h2c upgrade) passthrough to `origEmit`; rewrite paths have no traversal (fixed-prefix destinations); `proxyClientMaxBodySize` plumbing.

**Engine** — no infinite loop in the account loop (`auth.js:245` short-circuits `undefined`/`"noauth"` connection ids); no off-by-one in `getRotatedModels`/`rotateModelsFromIndex` (`combo.js:197-243`); no unawaited `async` in `forEach` anywhere in the engine remit; no unhandled rejections in `comboDeadline.js`/`withTimeout`/`collectPanel`; multi-byte UTF-8 and chunk-boundary SSE splitting correct (`stream.js:61,119,124,389-390`); abort propagation to upstream works (`streamHandler.js:49-51,171-175,254-258`); `config/brand.js` and `config/providerModels.js` internally consistent.

**Executors** — kiro EventStream parser fully bounds-checked with CRC verification (`kiro.js:1216-1300`) and correct abort/timeout cleanup; `default.js` refresh JSON errors caught; `qoder.js` peek/coalesce/cancel discipline; `devin-cli.js` NDJSON guarded, killTimer unref'd, child killed on abort; `antigravity.js` Retry-After parsing NaN-safe; `cursorChecksum.js` headers correctly lowercased for HTTP/2; `antigravity.js:167,294` `_lastSessionId` is dead state (no live bug).

**Persistence** — in-process read-modify-write races correctly serialized (every counter/ledger/merge inside one sync transaction); no `.exec(sql, params)` misuse; `run()` result shapes consistent across all four adapters; the migration chain is per-migration atomic and fails loud rather than silent.

**Translator / RTK** — all 12 request + 10 response translators imported (`translator/index.js:285-306`); every `register()` resolves to a real pair; the `claude:kiro` / `kiro:claude` direct routes are live; the RTK fail-open invariant holds in every hook (the only `throw` in `open-sse/rtk/` is inside a comment); the macOS arm64 tray download is checksum-verified (`cli/hooks/trayRuntime.js:194-198`).

**API surface** — remote `/v1|/v1beta|/api/v1|/api/v1beta|/codex|/responses` all require a valid API key (middleware) plus handler-level `requireApiKey`; the v1beta catch-all is covered; `PUBLIC_API_PATHS` contains no sensitive routes; fallback headers forward only `retry-after` / `anthropic-ratelimit-*` (no secret passthrough).

---

## 11. Coverage and limitations

- **Read in full:** `custom-server.js`; all 14 files under `src/sse/**`; all 22 `/api/v1/**` routes + both `/api/v1beta/**` routes; `dashboardGuard.js`, `trustedPeer.js`, `loginLimiter.js`, `ssrfGuard.js`, `src/proxy.js`; every `src/app/api/auth/**` route; `src/lib/auth/**`; `oauth/utils/server.js`; `src/mitm/{manager,server,logger,paths,cert/*,handlers/base}.js`; `open-sse/handlers/**`; `services/{combo,tokenRefresh,modelRenames}.js`; `utils/stream.js`; `executors/{kiro,cursor,codex,default,base,index,qoder,devin-cli,grok-cli,antigravity,windsurf,perplexity-web}.js`; `utils/cursorProtobuf.js`; `src/lib/db/**` (driver + 4 adapters + migrate + schema + paths + backup + all 13 repos); `cli/cli.js` + `cli/src/cli/**`; `scripts/launch.mjs`; `open-sse/translator/**` and `open-sse/rtk/**`.
- **Not deeply audited:** dashboard React component internals (only where they drive security-relevant calls); `open-sse/providers/registry/**` (consistency skim only); individual `src/lib/oauth/providers/*` token-exchange internals beyond their use of the audited callback proxies; the `cloud/` worker (not in this repo); dependency CVEs (`npm audit` was not part of this pass).
- **Verification limits:** no live provider calls were made; scenarios are reasoning traces over the quoted code, except where noted as reproduced in isolation on Node v22.22.2 (C-1's Node behaviour, H-2's timeout bypass, H-13's corruption modes, H-14's ATTACH no-op). The two-process sql.js overwrite (M-9) was reasoned from mechanism, not executed.
- **Known-safe items dropped during audit** (checked, no demonstrable failure): `fixMissingToolResponses` inserting OpenAI `role:"tool"` messages into Claude bodies; `killByPidFile` PID reuse; `getCliToken` secret-file race; a Claude `max_tokens`/thinking-budget edge at ceiling 1024; a missing `openai-responses:claude` direct route. Timing-unsafe `===` on the 128-bit CLI token and the default-password path are reported as Low (L-23) but not demonstrably exploitable over the network given the login lockout.

---

## 12. Appendix — audit provenance

This report is the synthesis of six parallel specialist passes plus lead-auditor re-verification. The seven most severe findings (C-1, H-1, H-3, H-7, H-10, H-21, H-24) were independently re-checked by the lead auditor by reading the exact lines quoted here; the remaining findings were verified by their originating pass against the current file contents, with call paths traced to confirm the flaw was not handled elsewhere.

**Prompt that produced this audit** (recorded for reproducibility — the "ideal prompt" form):

> Act as a senior software architect conducting a formal technical audit of the VitonlineRouter project at `C:/Users/HUAWEI/VitonlineRouter`. Priority order: (1) correctness bugs — logic errors, race conditions, async hazards, error-handling gaps; (2) security — auth bypass, secret leakage, injection, SSRF, unsafe deserialization; (3) reliability — resource leaks, missing timeouts/retries, crash-on-failure, silent data loss; (4) architecture only where it causes bugs. Evidence standard: every finding cites `file:line`, quotes the code, states a concrete failure scenario, assigns a severity, and gives a minimal fix; verify each claim against the current code before reporting; exclude style nits. Prioritise hot paths (CLI entry, API client, proxy/server, auth, state persistence). Deliverable: Markdown report with executive summary, severity-sorted findings table, detailed findings with code excerpts, and a prioritised remediation plan; state explicitly what was not covered.

*End of report.*
