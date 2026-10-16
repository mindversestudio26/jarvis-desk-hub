# Optional read-only Windows companion

This companion is a foreground Python process, not an installed privileged Windows service. It never invokes system-control commands. It needs no administrator privileges. CPU/RAM come from psutil; GPU and temperature are unavailable/null. Do not use estimated sensor values.

## Manual setup, after reviewing the configuration

1. Install Python from its official distribution and create a local virtual environment. Install `requirements.txt` in that environment. The sole dependency is open-source psutil 7.2.2.
2. Install official Tailscale on Windows and iPad and join the same private tailnet. Enable MagicDNS and tailnet HTTPS as appropriate. This requires the account owner's authentication and configuration; it is not automated here.
3. Generate a unique token locally with `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Keep it private, outside Git, backups and command transcripts. Set `JARVIS_READ_TOKEN` in the companion process environment using your local secret-handling method. Do not publish it or store it in the dashboard's source.
4. Start the process with your actual host and origin:

```powershell
python agent.py --origin https://mindversestudio26.github.io --host YOUR-PC.YOUR-TAILNET.ts.net
```

5. Configure **Tailscale Serve**, restricted to the iPad by tailnet ACLs, to proxy HTTPS to `http://127.0.0.1:8765`. Consult the [current Serve documentation](https://tailscale.com/docs/features/tailscale-serve) for your installed version. Never enable Tailscale Funnel or router port forwarding. Do not bypass certificate warnings.
6. Open Jarvis settings. Enter `https://YOUR-PC.YOUR-TAILNET.ts.net` and the token. No token is persisted. Exact allowed browser Origin is `https://mindversestudio26.github.io`, with no repository path or trailing slash.

Expected behavior: online and fresh telemetry while reachable; blank metrics and unreachable status on failure; reconnect every 10 seconds while the page is visible. The process must be running for monitoring. Browser private-network permission prompts, if presented, require user action. Physical iPad/Tailscale integration has not been verified by automated tests.

For automatic monitoring after Windows login, a future installation can use Task Scheduler under a standard user account with restart-on-failure. It must use an ACL-protected local secret file or Windows Credential Manager; do not place the token in task arguments. No scheduled task has been installed. For true startup-before-login service use, additional service lifecycle packaging and secret storage need implementation.

## Power and control design — not activated or implemented

The iPad dashboard remains usable when Windows is off. This agent cannot run while the PC is off, and it cannot turn itself back on. Wake-on-LAN would require supported hardware, explicit firmware/network setup and an always-on device on the LAN to relay a magic packet. No such relay is assumed or installed; switching on is currently manual.

Before implementing remote control, obtain explicit owner approval and introduce a **separate control credential**, disabled by default. Monitoring credentials must never authorize controls. Allow only fixed action IDs and a locally configured app allowlist; reject arbitrary executables, shell commands, arguments and URLs. Require foreground UI review plus a server-issued single-use challenge tied to the specific action and a 15-second expiry. The confirmation dialog must name the target PC/action and warn about unsaved work. Consume the challenge atomically, reject replay, rate-limit, audit without tokens, and require a fresh explicit user confirmation for each lock, sleep, shutdown or app-launch request. No scheduler, heartbeat or monitoring callback may invoke control actions. Tests and a threat review are required before enabling any command.

## Protocol

`GET /v1/status`, exact allowed Origin/Host and `Authorization: Bearer <read-only-token>` required. Response fields: `protocol:1`, `sampled_at` UTC ISO timestamp, `cpu_percent`, `ram_percent`, nullable `gpu_percent` and `temperature_c`, `control_enabled:false`. Dashboard rejects timestamps older than 30 seconds or more than 5 seconds into the future. Keep Windows and iPad clocks automatic.

Loopback is the only bind address. Invalid Origin/Host → 403; invalid bearer → 401; authenticated reads faster than twice per second → 429; unavailable first sample → 503; non-status path → 404; write methods → 405. The exact Origin check protects browser access but is not itself authentication: non-browser clients can spoof headers, so the random bearer token and tailnet ACL are required.

Rotate the token by stopping the process, replacing the environment secret and restarting; reconnect the dashboard. Stop with Ctrl+C. Remove Serve configuration when decommissioning. No control endpoint exists to exploit or accidentally trigger.
