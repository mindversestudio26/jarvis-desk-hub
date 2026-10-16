# JANGE authenticated backend release boundary

This is executable preparation, not authorization to deploy. Current hosted backend fixtures remain at the previously verified revision; the new source below has not been installed on Hostinger. Claude's UI, technical names, API paths and existing dashboard storage remain untouched.

## Evidence boundary

| Category | Evidence |
| --- | --- |
| Actual Hostinger, prior run | 25 core checks and seven encrypted-export/integrity checks PASS on PHP 8.3.35 / MariaDB 11.8.9. Reviewed saved reports; not rerun. No hosted HTTPS authentication or restore was established. |
| Current read-only Hostinger inspection | Private directory 0700; key/config/password/archive/reports 0600; no JANGE cron remains, original three schedules unchanged. No key contents read. |
| New local tests | 41/41 PHP 8.3 API/release regressions PASS. Strictly verified loopback TLS probe checks authentication, cookie attributes, two sessions, CSRF/Origin/Host rejection, concurrent client writes, retries/tombstones, binding, revocation and missing-audit 503. Private logging rotation/concurrency, gate policy and restore planning tested. |
| Prepared, not hosted-tested | PHP gate/Apache-style template, private logger, strict HTTPS client, grants renderer, read-only release audit and restore plan. Hostinger LiteSpeed configuration semantics/CDN behavior are not certified by local PHP tests. |
| Blocked | Gate activation approval, approved exact peer IPs/token and synthetic application credential, off-host key recovery evidence, effective-grant closure and separate approved restore target/tooling. |

## Database separation

Actual schema grants currently include four runtime DML privileges plus two unnecessary privileges:

- `DELETE HISTORY` permits removing historical rows of system-versioned tables. JANGE's ordinary InnoDB tables have no system-versioning feature and no history-deletion statements.
- `SHOW CREATE ROUTINE` exposes stored routine definitions. JANGE uses prepared SQL directly, not stored routines; it is not needed to execute this API.

These conclusions follow the current schema/query audit and [MariaDB GRANT documentation](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/grant), [SHOW PRIVILEGES](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/show/show-privileges) and [SHOW CREATE PROCEDURE](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/show/show-create-procedure). Do not describe these privileges as harmless merely because the current schema does not use them.

`bin/staging-grants.py` renders SQL only. It accepts only dedicated `*_jarvis_stg`/`*_jarvis_verify` names and distinct `*_jv...` identities. It never connects, creates an account or changes credentials. The two extra grants can be revoked by an authorized database administrator. The earlier Hostinger permission form exposed neither extra grant and the runtime account has no grant authority; do not widen its privileges to revoke them. Ask Hostinger for the supported database-specific administrative path if necessary.

Desired runtime: SELECT/INSERT/UPDATE/DELETE on one staging database; no DDL, routine, FILE, global grant or GRANT OPTION. Separate initial-schema migration identity: CREATE on that database only, then revoke CREATE. Future ALTER/DROP migrations require a reviewed migration, not permanent runtime access. The renderer removes existing database-scoped migration privileges before granting CREATE; it does not certify inherited/table/column/role/global grants. Review those separately and confirm no stored routines/system-versioned tables. No real permissions were changed this round.

## Key and diagnostic custody

The current host-generated raw 32-byte key is outside public_html in the owner-only fixture directory. Permissions were observed, not key contents. The encrypted archive and key are on the same hosting account: **this is not a disaster-recovery key backup**. Another compromised website running under the same Unix UID may still read them. Separate website directories and 0700 cannot establish a separate security principal.

Required owner action: download the existing key directly through authenticated File Manager into the owner's encrypted password manager/offline encrypted vault; retain a second controlled copy separately from encrypted archives. Never paste it into chat, frontend, logs, Git or a URL. Test the owner's recovered copy offline against the synthetic archive in a disposable environment, verify authenticated records/retry history, fresh generation and excluded sessions. A lost key cannot be recovered by password reset. No off-host export or actual-key recovery drill was performed here.

New `JARVIS_SECURITY_LOG_DIR` must name an existing dedicated private directory outside document roots. `src/private-log.php` uses 0700/0600, a shared lock for append/rotation and fixed JSON fields: component/event/status/UTC time. It rejects arbitrary event text; no usernames, IPs, tokens, payloads, notes, SQL or exceptions enter this log. Current + two archives, each at most 64 KiB, bound storage to 192 KiB plus a tiny lock file. Rotation removes the oldest segment; this policy must be accepted before activation. Size retention is implemented; calendar-age retention is not. No log-pruning cron was activated.

Hosted API configuration now fails closed with 503 if private auditing is absent or unwritable. There is no account-wide `error_log()` fallback. Local development remains usable without a log directory. This is a release prerequisite, not a silent deployed change. The fixed-event audit is diagnostic/security metadata, not a full PHP stack log. Native PHP log routing/retention remains unverified; do not enable shared account logging or raw exception capture. Sampling actual hosted diagnostic logs is still required after approved deployment.

`bin/release-audit.php` is read-only, emits no key/account/path/record values and deliberately never asserts production readiness. It checks baseline schema grants, visible global grants, private modes and configured log directory. It does not prove off-host custody, all inherited roles/object grants, HTTPS or restore.

## Proposed temporary HTTPS exception — approval required

Keep the current public root deny-all gate. The proposed exception is **only a PHP entry for the named API routes**, not an open website:

1. Preserve the exact live .htaccess outside public_html and stage reviewed backend files privately under `.jange-http`; preserve the existing fixture database/key/archive. Configure the same staging HTTPS origin and its restricted runtime database, without copying any Claude/root UI assets.
2. Owner approves up to four exact server-observed peer IPs, a start time and deadline no longer than two hours. Never trust X-Forwarded-For. If CDN/proxy peer identity cannot safely distinguish the authorized client, do not activate or broaden the allowlist; investigate first.
3. Owner-controlled new 256-bit test token is supplied only in `X-Jange-Staging-Token`. Private `gate.local.php` holds its SHA-256, peer IPs and deadline, with 0600 permissions. No query-string token, token in HTML/JS, wildcard IP, public test registration or bypass endpoint.
4. `deploy/private-entry.php.example` checks HTTPS, exact staging Host, exact peer IP, token, deadline and route before including the existing API. Missing/expired/malformed policy returns 403. Application cookie/CSRF/Origin checks remain independently required. AI/control routes are excluded.
5. `deploy/private-gate.htaccess.example` retains default `Require all denied` but proposes one `<Files "api.php"> Require all granted` exception so PHP can enforce the private policy. **This changes the current gate and is NOT installed.** Apache section merging is documented by [mod_authz_core](https://httpd.apache.org/docs/2.4/mod/mod_authz_core.html); Hostinger uses [LiteSpeed and .htaccess](https://www.hostinger.com/support/which-file-transfer-and-server-access-options-are-supported-at-hostinger/), so exact hosted rewrite/merging behavior still requires controlled validation. No claim of equivalent host behavior is made.
6. Check root, direct api.php, missing/bad token, wrong peer, expired policy and excluded routes all return 403; only the approved combination reaches the API. Confirm certificate validation/no redirects, private logging and no CDN/cache hits. Any unexpected public success: immediately restore the saved deny-all gate, then investigate.
7. Remove the temporary entry/policy and restore the original gate after testing, even though the PHP deadline already fails closed. No background worker, new service, DNS change or recurring cron is needed for the HTTP probe.

Approval must explicitly cover that API-only .htaccess/PHP exception and bounded access policy. Current authorization covers preparing these inert files, not installing them. A valid synthetic application credential is also needed: the old CLI fixture used a random undisclosed owner password. Do not reset a database password or bypass authentication. Review a dedicated-database-only private CLI application-password rotation and have the owner enter the new credential before executing it; existing production/local-only recovery restrictions remain intact.

## Executable HTTPS and browser matrix

`python tests/hosted_https.py` is inert by default. After approval and safe credential provisioning, `--execute` reads token/username/password from owner-controlled environment variables, pins the staging origin, uses verified TLS, rejects redirects, bounds responses and emits sanitized check names only. It writes unique synthetic task IDs, tombstones only its own successful fixture and logs out its sessions. Interrupted runs may leave synthetic records/session data for reviewed cleanup; never bulk-delete unfamiliar rows.

The local test uses an authenticated loopback TLS bridge with an isolated trusted test certificate. It does not alter OS/browser trust stores. PHP remains one local worker; concurrent HTTP clients are tested, not Hostinger's multi-worker scheduling. Cookie attributes are inspected; actual Safari cookie semantics are not inferred.

| Test | Execution boundary |
| --- | --- |
| Login/logout, cookie attributes, two sessions, CSRF/Origin/Host, sync/retry/conflict/binding/revocation | Client prepared and locally TLS-tested; hosted run blocked by gate/credentials. |
| Absolute/idle expiry | Existing local API regressions pass. Hosted test requires a private CLI fixture that expires only an identified synthetic session, then HTTPS rejection; no test-only public endpoint. Not yet executed. |
| CDN/cache behavior | API and gate no-store; client rejects cached auth evidence (Age/cache-hit). Compare repeated snapshots/two sessions and inspect actual hosted cache headers after approval. No shared CDN setting changes. |
| Browser offline/multi-tab | Existing Chromium/WebKit adapter regressions are prior local evidence. API probe's lost-ack replay is not browser offline proof. A separately approved private browser-test asset path is needed for actual hosted browser tests. |

The existing engineering console registers root `/sw.js` and caches root shell files. Deploying it under a private subpath unchanged would not test offline behavior correctly, while allowing its root files changes the gate. Therefore the API-only proposal **does not yet authorize or enable hosted browser offline tests**. After API-gate validation, review an exact static-fixture allowlist and a test-only scoped worker/harness (outside Claude's frontend), with the same private policy, no cached credentials/API responses and explicit worker/cache cleanup. Do not expose the existing root shell or claim the API client verifies offline UX. All remaining hosted matrix rows stay blockers until this second reviewed scope is approved.

## Restore preparation, no target provisioned

`bin/restore-plan.php ARCHIVE TARGET_NAME` authenticates a bounded format-2 archive and nested ciphertext without a database connection or any writes. It accepts only a separate `*_jarvis_restore` namespace, rejects stg/verify source targets, reports counts only and cannot prove target emptiness. Local valid/tampered archive, namespace rejection and archive-invariance tests pass. It is not a hosted restore tool and was not run against the real hosted archive this round.

Before a hosted drill: obtain explicit approval for a new empty disposable restore database; owner creates its credential without sharing it in chat. Precreate only the five reviewed InnoDB tables with the migration identity, then remove DDL authority. Separately review a host-specific importer; keep `backup.php restore-local` restricted to local targets. Importer must pin exact source/target names, reject identical/source targets or nonempty tables, take an exclusive execution claim, authenticate the whole archive before writes, compare columns/types/IDs, import atomically under InnoDB, preserve subject/workspace/revisions/tombstones, generate a fresh restore generation, exclude sessions/rate buckets, and refuse overwrite. Source and archive must remain unchanged. Do not run an importer before its independent review and target approval.

Verification must compare decrypted synthetic Unicode/live/deleted records and retry history, reject old-generation offline writes, confirm zero restored sessions and test transaction rollback/interrupted import. On failure, stop using only the disposable target; retain source/archive/key/gate. Do not DROP databases or restore over existing data as cleanup. No new database, restore, import or infrastructure activation occurred.

## Claude integration

Same-origin `/api/v1` cookies and contract remain stable. Deploy schema/server/adapter as one reviewed release; preserve localStorage, bound IndexedDB queues, cache epochs and 412/428 fail-closed handling. Gate token is infrastructure test authorization, not an application session and not something Claude should embed in frontend code. No frontend integration or visual changes were made. The mandatory private audit configuration is the only new backend release prerequisite.

References consulted locally: system-design-primer reverse-proxy/session discussions and Penpot MCP session-isolation regression tests. Patterns informed explicit peer/session boundaries and negative tests; no implementation was copied. Penpot's URL-token pattern was not adopted.
