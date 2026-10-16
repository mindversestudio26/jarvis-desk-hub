<#
.SYNOPSIS  Stops the JANGE companion started by start.ps1.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$proc = Get-CompanionProcess
if (-not $proc) { Write-Host 'Companion is not running.' }
else {
    # The venv launcher owns the interpreter; stopping its tree stops the companion.
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $($proc.Id)" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $proc.Id -Force
    Write-Host "Companion stopped (PID $($proc.Id))."
}
Remove-Item $PidFile -ErrorAction SilentlyContinue
