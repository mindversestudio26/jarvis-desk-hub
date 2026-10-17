<#
.SYNOPSIS
  Installs the JANGE read-only companion for the current Windows user. No admin rights.
.DESCRIPTION
  Copies the companion to %USERPROFILE%\.jange\companion, creates a private Python
  virtual environment with psutil, records the tailnet host and allowed origin, and
  creates a random read-only pairing token stored with Windows DPAPI. The token is
  never shown here; use share-token.ps1 to move it to the iPad.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1
#>
[CmdletBinding()]
param(
    [string]$TailnetHost = '',
    [string]$Origin = 'https://mindversestudio26.github.io',
    [int]$Port = 8765,
    [switch]$NewToken
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

New-Item -ItemType Directory -Force -Path $App | Out-Null
# Only this user (and SYSTEM) may open the folder; the token is DPAPI-encrypted as well.
$me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $App /inheritance:r /grant:r "*${me}:(OI)(CI)F" /grant:r '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE) { throw 'Restricting the install folder failed.' }

$source = Split-Path $PSScriptRoot -Parent
Copy-Item (Join-Path $source 'control.py'), (Join-Path $source 'agent.py'), (Join-Path $source 'requirements.txt') $App -Force
# install.ps1 stays in the repo: it copies from beside itself.
Copy-Item (Join-Path $PSScriptRoot '*.ps1') $App -Exclude 'install.ps1' -Force
Remove-Item (Join-Path $App 'install.ps1') -ErrorAction SilentlyContinue

$python = Join-Path $App 'venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    $base = (Get-Command python -ErrorAction Stop).Source
    & $base -m venv (Join-Path $App 'venv')
    if ($LASTEXITCODE -or -not (Test-Path $python)) { throw 'Creating the Python environment failed. Install Python 3 from python.org.' }
}
& $python -m pip install --disable-pip-version-check --quiet -r (Join-Path $App 'requirements.txt')
if ($LASTEXITCODE) { throw 'Installing psutil failed.' }

if (-not $TailnetHost) {
    $self = (& $Tailscale status --json | ConvertFrom-Json).Self
    if (-not $self -or -not $self.DNSName) { throw 'Tailscale is not signed in on this PC.' }
    $TailnetHost = $self.DNSName.TrimEnd('.')
}
if ($TailnetHost -notmatch '\A[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+\.ts\.net\z') { throw "Unexpected tailnet host '$TailnetHost'." }
if ($Origin -notmatch '\Ahttps://[a-zA-Z0-9.-]+(:[0-9]+)?\z') { throw "Origin must be an exact https:// origin without a path." }
[ordered]@{ origin = $Origin; host = $TailnetHost; port = $Port } | ConvertTo-Json | Set-Content $ConfigFile -Encoding utf8

if ($NewToken -or -not (Test-Path $TokenFile)) {
    New-PairingToken
    Write-Host 'Created a new read-only pairing token (stored encrypted for this Windows user).'
    if (Get-CompanionProcess) {
        # A running companion still accepts the old token until it restarts.
        & (Join-Path $App 'stop.ps1'); & (Join-Path $App 'start.ps1')
        Write-Host 'Restarted the companion: the previous token no longer works. Pair JANGE again.'
    }
}
Write-Host "Installed in $App"
Write-Host "Companion address for JANGE: https://$TailnetHost"
