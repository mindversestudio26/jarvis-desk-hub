<#
.SYNOPSIS  Health check: process, local API with the real token (never printed), Tailscale Serve.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$cfg = Get-CompanionConfig
$proc = Get-CompanionProcess
Write-Host ("Process:     " + $(if ($proc) { "running (PID $($proc.Id))" } else { 'not running' }))

function Probe([string]$Url, [hashtable]$Headers) {
    try {
        $r = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec 6 -MaximumRedirection 0
        return @{ code = [int]$r.StatusCode; body = $r.Content }
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        return @{ code = $(if ($resp) { [int]$resp.StatusCode } else { 0 }); body = ''; error = $_.Exception.Message }
    }
}
# The token goes only to our own companion: if it is not running, whatever holds the port gets nothing.
if (-not $proc) { Write-Host 'Start it with start.ps1.'; & $Tailscale serve status; return }
$auth = @{ Origin = $cfg.origin; Authorization = 'Bearer ' + (Get-PairingToken) }
$local = Probe "http://127.0.0.1:$($cfg.port)/v1/status" $auth
Write-Host "Local API:   HTTP $($local.code)"
if ($local.code -eq 200) {
    $d = $local.body | ConvertFrom-Json
    Write-Host ("Readings:    CPU {0}%  RAM {1}%  GPU {2}  Temp {3}  Uptime {4}s  sampled {5}" -f $d.cpu_percent, $d.ram_percent, $(if ($null -ne $d.gpu_percent) { "$($d.gpu_percent)%" } else { 'n/a' }), $(if ($null -ne $d.temperature_c) { "$($d.temperature_c) C ($($d.temperature_source))" } else { 'n/a' }), $d.uptime_seconds, $d.sampled_at)
}
Start-Sleep -Milliseconds 600 # the companion allows two authenticated reads per second
$remote = Probe "https://$($cfg.host)/v1/status" $auth
Write-Host "Tailnet HTTPS: HTTP $($remote.code)  (https://$($cfg.host))"
if (-not $remote.code) { Write-Host "  $($remote.error)" }
Write-Host 'Tailscale Serve:'
& $Tailscale serve status
