# JANGE — conditional HTTPS approval: prerequisites not satisfied

The owner conditionally approved API-only testing for at most two hours, with exact approved IPs, a separate strong token, public 403 for everyone else and automatic restoration of the original web-server rules. No browser/static/SW access, production work or new restore database is approved.

## Current outcome

**No API exception was installed. No test window started.** The public .htaccess was read only and remains unchanged. Its original content is 256 bytes, SHA-256 `de66a4e53c9cca539e0388249a8c5a01fe3cceafa3c96d39d4371ecb7be77413`. A private/off-host copy and evidence were saved without changing the live file.

Read-only hPanel inspection now shows **CDN Active** for the staging website. This is a newly established prerequisite problem; it is not permission to disable CDN or whitelist its edge addresses. Actual PHP REMOTE_ADDR semantics and trusted proxy rewriting are not verified. No exact approved client allowlist has been established. Do not substitute forwarded headers or a shared hosting/CDN address for an authorized end-user peer.

The available Hostinger Agent response cannot certify account-specific peer-IP semantics or an exact deadline guarantee for shared-hosting cron. A human technical review was requested with explicit no-change instructions. This is pending guidance, not a human-verified network configuration or timing guarantee. Support was not authorized to change CDN, DNS, PHP, workers, files, credentials or the plan.

## Additional automatic-closure preparation

`src/staging-shutdown.php` and CLI-only `bin/staging-watchdog.php` prepare a site-scoped restoration mechanism. It accepts only the dedicated staging hostname/private-directory layout, verifies the pinned original backup, atomically installs the original 0644 .htaccess at expiry, and recoverably quarantines matching temporary API entry/policy files. Invalid window metadata closes access; an unverified original backup installs an emergency deny-all file rather than claiming exact restoration. No arbitrary target path, shell execution, HTTP control endpoint or deletion of unfamiliar data is implemented.

Local PHP 8.3 filesystem tests cover exact original hash, no pre-expiry mutation, expiry/repeated restoration, quarantine, malformed/unbounded policy denial, another-target rejection and tampered-backup emergency closure. These tests use a disposable directory and injected clock values, **not Hostinger cron or a real web server**. One first run hit sandbox temporary-directory permission denial; the isolated rerun outside that restriction passed. No hosted watchdog/cron was created or scheduled, and no strict-deadline guarantee is claimed.

A best-effort cron plus PHP TTL does not satisfy the owner's stronger requirement merely because the restoration function works locally. A delayed/failed scheduler could leave changed web-server rules in place after PHP denies access. Do not open access until a supported, actually verified automatic server-rule restoration mechanism meets the condition. Never silently reinterpret the condition as PHP expiry alone. The previous API-only template is therefore insufficient for activation on its own.

## Secret preparation only

An ignored owner-only local input file was prepared, with a 256-bit random token generated privately and never printed or committed. The Codex preview was not editable for the owner, so an empty owner-only 0600 password input file was prepared outside staging public_html through the existing authenticated File Manager. The owner reports saving a new synthetic application-test password. Its contents were not displayed or copied into reports/Git, and it has **not** been applied to an account. Database/login credentials were not rotated. Do not collect passwords in chat.

## What remains untested

Hosted HTTPS login/logout, cookie attributes, session expiry/revocation, concurrent authenticated requests, MariaDB synchronization over HTTPS, cache/CDN separation, wrong-peer/token denial and hosted timed restoration remain NOT RUN. Earlier 25/7 hosted CLI passes and 41 local API/release tests retain their original scope; no new hosted-authentication success is inferred.

## Exact next step

Obtain account-specific trusted-peer/proxy evidence and an officially supported, verified timed server-rule restoration path, then establish the owner's exact allowlist. If the hosting cannot meet these requirements, report that limitation and keep the original gate. A different testing architecture or a change to the conditions requires a separate owner decision. No additional spending or infrastructure activation is authorized as a workaround.

The current testing period has no start/end because it never opened. Only prerequisite investigation and reversible source preparation occurred. PR remains Draft; no main merge, Claude frontend edit, original website/email change, shared PHP change or restore-target creation occurred.
