<#
.SYNOPSIS  Starts the JANGE companion hidden, on 127.0.0.1 only, as the current user.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

if (Get-CompanionProcess) { Write-Host 'Companion is already running.'; return }
$cfg = Get-CompanionConfig
$pythonw = Join-Path $App 'venv\Scripts\pythonw.exe'
$arguments = @('"' + (Join-Path $App 'agent.py') + '"', '--port', $cfg.port, '--origin', $cfg.origin, '--host', $cfg.host)

# The token reaches the companion through its environment only, never its command line.
$env:JARVIS_READ_TOKEN = Get-PairingToken
try {
    $proc = Start-Process -FilePath $pythonw -ArgumentList $arguments -WorkingDirectory $App -WindowStyle Hidden -PassThru
} finally {
    Remove-Item Env:JARVIS_READ_TOKEN -ErrorAction SilentlyContinue
}
$proc.Id | Set-Content $PidFile -Encoding ascii
# pythonw has no console, so confirm the companion's own interpreter is listening before reporting success.
$up = $false
for ($i = 0; $i -lt 40 -and -not $up -and -not $proc.HasExited; $i++) {
    Start-Sleep -Milliseconds 250
    $owner = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $cfg.port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    $up = $owner -and ((Get-CimInstance Win32_Process -Filter "ProcessId = $owner").ParentProcessId -eq $proc.Id)
}
if (-not $up) {
    & (Join-Path $App 'stop.ps1') | Out-Null
    throw "The companion did not start: port $($cfg.port) may be in use, or Python/psutil is broken. Run install.ps1 again."
}
Write-Host "Companion started (PID $($proc.Id)) on 127.0.0.1:$($cfg.port) for https://$($cfg.host)"
