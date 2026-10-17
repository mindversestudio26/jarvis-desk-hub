<#
.SYNOPSIS  Starts the JANGE companion hidden, on 127.0.0.1 only, as the current user.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

if (Get-CompanionProcess) { Write-Host 'Companion is already running.'; return }
$cfg = Get-CompanionConfig
$pythonw = Join-Path $App 'venv\Scripts\pythonw.exe'
$arguments = @(('"' + (Join-Path $App 'agent.py') + '"'), '--port', $cfg.port, '--origin', $cfg.origin, '--host', $cfg.host)

# Credentials and the spawned process are cleaned up even when loading or PID writes fail.
$proc = $null
$started = $false
try {
    try {
        Remove-Item Env:JARVIS_READ_TOKEN -ErrorAction SilentlyContinue
        Remove-Item Env:JANGE_CONTROL_TOKEN -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $ControlConfigFile) {
            $controlConfig = Get-Content -LiteralPath $ControlConfigFile -Raw | ConvertFrom-Json
            if ($controlConfig.enabled -eq $true) {
                $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
                try {
                    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
                    $elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
                } finally { $identity.Dispose() }
                if ($elevated) {
                    Write-Warning 'Elevated session: starting monitoring only. Start unelevated to use controls.'
                } else {
                    $arguments += @('--control-config', ('"' + $ControlConfigFile + '"'))
                    $env:JANGE_CONTROL_TOKEN = Get-ControlToken
                }
            }
        }
        $env:JARVIS_READ_TOKEN = Get-PairingToken
        $proc = Start-Process -FilePath $pythonw -ArgumentList $arguments -WorkingDirectory $App -WindowStyle Hidden -PassThru
    } finally {
        Remove-Item Env:JARVIS_READ_TOKEN -ErrorAction SilentlyContinue
        Remove-Item Env:JANGE_CONTROL_TOKEN -ErrorAction SilentlyContinue
    }
    $proc.Id | Set-Content -LiteralPath $PidFile -Encoding ascii
    # The venv launcher owns the listening interpreter.
    $up = $false
    for ($i = 0; $i -lt 40 -and -not $up -and -not $proc.HasExited; $i++) {
        Start-Sleep -Milliseconds 250
        $owner = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $cfg.port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
        $up = $owner -and ((Get-CimInstance Win32_Process -Filter "ProcessId = $owner").ParentProcessId -eq $proc.Id)
    }
    if (-not $up) { throw 'The companion did not start or did not own its listening port.' }
    $started = $true
} finally {
    if ($proc -and -not $started) {
        # Use the actual process handle, not a PID file that may never have been written.
        # Stop the launcher first so it cannot create a child after enumeration.
        if (-not $proc.HasExited) {
            $proc.Kill()
            if (-not $proc.WaitForExit(5000)) { throw 'Companion launcher did not stop.' }
        }
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($proc.Id)" -ErrorAction Stop)
        foreach ($child in $children) {
            $childProcess = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            if ($childProcess) {
                $childProcess.Kill()
                if (-not $childProcess.WaitForExit(5000)) { throw 'Companion child did not stop.' }
            }
        }
        Remove-Item -LiteralPath $PidFile -ErrorAction SilentlyContinue
    }
}
Write-Host "Companion started (PID $($proc.Id)) on 127.0.0.1:$($cfg.port) for https://$($cfg.host)"
