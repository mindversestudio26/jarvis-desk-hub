<#
.SYNOPSIS
  Optional: start the companion when this user signs in to Windows (no admin rights).
.DESCRIPTION
  Registers a per-user Task Scheduler task "JANGE Companion" that runs start.ps1 hidden
  at logon, with limited rights. -Remove deletes the task.
  The companion only runs while you are signed in; it cannot run while the PC is off.
#>
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$name = 'JANGE Companion'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed the '$name' sign-in task."
    return
}
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$start = Join-Path $App 'start.ps1'
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Starts the JANGE read-only companion (loopback only) at sign-in.' -Force | Out-Null
Write-Host "Registered '$name': starts at sign-in for $user with standard rights. Remove with: autostart.ps1 -Remove"
