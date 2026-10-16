# Optional read-only Windows companion

The companion is a small Python process that runs as the signed-in Windows user. It is not a privileged Windows service, needs no administrator rights and never runs system-control commands.

What it reports:
- **CPU and RAM** come from psutil.
- **GPU load and GPU temperature** come from the NVIDIA driver's own `nvidia-smi` (from its fixed install location, never PATH; polled every 5 seconds, no shell) when an NVIDIA GPU is present (the first GPU, if there are several). Without one, both are `null`.
- **CPU temperature** is not reported: Windows exposes it only to administrators or kernel drivers. The temperature shown is the GPU's, and it is labelled "GPU".
- Uptime comes from the boot time.

No value is ever estimated: an unavailable reading is `null` and the dashboard shows "N/A" or "No sensor".

## Windows setup (scripts in `windows/`, no admin rights)

1. Install Python 3 from python.org. Install official Tailscale on the PC and the iPad, on the same tailnet with MagicDNS.
2. Run the installer:

   ```powershell
   powershell -ExecutionPolicy Bypass -File companion\windows\install.ps1
   ```

   It:
   - creates `%USERPROFILE%\.jange\companion`, which only this user and SYSTEM can open (`%USERPROFILE%`, not AppData, because packaged apps get AppData redirected);
   - copies the companion and scripts there and creates a private virtual environment with psutil 7.2.2;
   - records the PC's tailnet name (from `tailscale status`), the allowed origin and the port in `config.json`;
   - creates a random 256-bit read-only token, encrypted with Windows DPAPI (`token.dpapi`), so only this Windows account on this PC can decrypt it. The token is never printed.

   Run it again from the repo with `-NewToken` to rotate the token; a running companion is restarted so the old token stops working at once.
3. In the install folder, start the companion with `start.ps1` and check it with `status.ps1`.
   - `start.ps1` launches it hidden on `127.0.0.1:8765`. The token is passed only through the process environment, never the command line. The companion removes it from its own environment at startup, so `nvidia-smi` never inherits it; the hidden venv launcher process keeps a copy, readable only by this Windows user (who can already decrypt the DPAPI file).
   - `status.ps1` shows the process, a local read and a tailnet HTTPS read (the token is used but not shown), the readings and the Serve configuration.
   - `stop.ps1` stops the companion.
4. Publish it to your tailnet only, with **Tailscale Serve** (never Funnel, never router port forwarding):

   ```powershell
   & "$env:ProgramFiles\Tailscale\tailscale.exe" serve --bg --https=443 http://127.0.0.1:8765
   ```

   Restrict who can reach it with your tailnet access controls, for example a grant that lets only the iPad reach `tcp:443` on the PC. The first time, Tailscale asks the tailnet owner to enable Serve and HTTPS certificates in the admin console. Note that HTTPS certificates put the PC's tailnet name (for example `your-pc.your-tailnet.ts.net`) in the public Certificate Transparency logs. Undo with `tailscale serve --https=443 off`. Do not bypass certificate warnings.
5. Move the token to the iPad without it touching a chat, a file in Git or a log:

   ```powershell
   powershell -ExecutionPolicy Bypass -File share-token.ps1 -Via Taildrop -Device ipad-gen-7
   ```

   Taildrop sends a one-off file over the tailnet: on the iPad open Files › Tailscale, copy the token, then delete the file. Alternatives: `-Via Window` shows it in a window on the PC; `-Via Clipboard` copies it outside clipboard history and cloud sync and clears it after 60 seconds.
6. In JANGE open Settings › Workstation. Enter `https://YOUR-PC.YOUR-TAILNET.ts.net` and the token. The dashboard keeps the token in memory only, so pair again after reloading the page.

### Optional: start at sign-in

`autostart.ps1` registers a per-user Task Scheduler task "JANGE Companion". It runs `start.ps1` at sign-in with standard rights; `start.ps1` fails visibly if the companion does not come up. If it stops later, run `start.ps1` again. `autostart.ps1 -Remove` deletes it. The token stays in DPAPI storage, never in the task's arguments. The companion runs only while you are signed in.

Expected behaviour:
- Fresh telemetry while the PC is reachable.
- When it is not: blank metrics and "Unreachable", with a retry every 10 seconds while the page is visible.
- A rejected token shows "Authentication required" and stops polling.

## Manual setup (other systems)

Create a virtual environment with `requirements.txt`. Generate a token with `python -c "import secrets; print(secrets.token_urlsafe(32))"` and keep it out of Git, backups and transcripts. Put it in `JARVIS_READ_TOKEN` in the process environment, then run:

```
python agent.py --origin https://mindversestudio26.github.io --host YOUR-PC.YOUR-TAILNET.ts.net
```

Then do steps 4 and 6 above.

## Power and control design — not activated or implemented

The iPad dashboard remains usable when Windows is off. The agent cannot run while the PC is off, and it cannot turn the PC back on. Wake-on-LAN would need:
- supported hardware;
- explicit firmware and network setup;
- an always-on device on the LAN to relay the magic packet.

No such relay is assumed or installed, so switching the PC on is manual.

Before remote control is implemented, the owner must approve it explicitly, and the design must meet these requirements:
- **Separate credential.** Controls use their own control credential, disabled by default. The monitoring credential never authorises controls.
- **Allowlisted actions only.** Fixed action IDs and a locally configured app allowlist. Arbitrary executables, shell commands, arguments and URLs are rejected.
- **Per-action confirmation.** Each action needs foreground UI review and a server-issued single-use challenge tied to that action, expiring after 15 seconds. The dialog names the target PC and action and warns about unsaved work. Every lock, sleep, shutdown or app launch needs its own fresh confirmation.
- **Replay and abuse protection.** The challenge is consumed atomically and replays are rejected. Requests are rate-limited and audited without tokens.
- **No automatic triggers.** No scheduler, heartbeat or monitoring callback may invoke control actions.
- **Verification first.** Tests and a threat review come before any command is enabled.

## Protocol

**Request:** `GET /v1/status` with the exact allowed Origin and Host and `Authorization: Bearer <read-only-token>`.

**Response fields:**
- `protocol: 1`
- `sampled_at`: UTC ISO timestamp
- `cpu_percent`, `ram_percent`
- nullable `gpu_percent`, `temperature_c`, `temperature_source` (`"gpu"`) and `uptime_seconds`
- `control_enabled: false`

The dashboard rejects timestamps older than 30 seconds or more than 5 seconds in the future, so keep the Windows and iPad clocks automatic.

**Binding:** loopback only; Tailscale Serve connects from loopback. Allowed Host headers are the tailnet name and `127.0.0.1:<port>`.

**Error responses:**
- invalid Origin or Host: 403
- invalid bearer token: 401
- authenticated reads more than twice per second: 429
- no first sample yet: 503
- any path other than `/v1/status`: 404
- write methods: 405

The Origin check protects browser access but is not authentication on its own. Non-browser clients can spoof headers, so the random bearer token and the tailnet are what keep it private. No control endpoint exists to exploit or trigger by accident.
