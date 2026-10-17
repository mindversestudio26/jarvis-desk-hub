<#
.SYNOPSIS
Opt-in control update. Run ONLY after the owner approves activation.
Existing monitoring token, tailnet access, Serve, power-on setup and autostart are unchanged.
.PARAMETER Enable
Install and enable controls, provisioning a separate DPAPI credential only if absent.
.PARAMETER Disable
Disable controls and restart the companion in monitoring-only mode; no repository is needed.
.PARAMETER AllowlistPath
Local JSON array of {id,label,path}. Paths are vetted by Python; no args or URLs.
#>
[CmdletBinding(DefaultParameterSetName='Enable')]
param(
 [Parameter(Mandatory,ParameterSetName='Enable')][switch]$Enable,
 [Parameter(Mandatory,ParameterSetName='Disable')][switch]$Disable,
 [Parameter(Mandatory,ParameterSetName='Enable')][string]$AllowlistPath
)
$ErrorActionPreference='Stop'
if ($Enable -and ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Enable controls from a non-elevated PowerShell session. No changes were made.' }
. (Join-Path $PSScriptRoot 'common.ps1')
$python=Join-Path $App 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $TokenFile)) { throw 'Install read-only monitoring first.' }

function Stop-ControlRuntime {
 # Record the known launcher and its children before stop.ps1 removes the PID file.
 $runtime = Get-CompanionProcess
 $runtimeIds = @()
 if ($runtime) {
  $runtimeIds = @($runtime.Id) + @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($runtime.Id)" | Select-Object -ExpandProperty ProcessId)
 }
 & (Join-Path $App 'stop.ps1') | Out-Null
 if ((Get-CompanionProcess) -or ($runtimeIds.Count -gt 0 -and @(Get-Process -Id $runtimeIds -ErrorAction SilentlyContinue).Count -gt 0)) {
  throw 'Companion did not stop; runtime files must not be replaced.'
 }
}
function Assert-ControlRuntime {
 $runtime = Get-CompanionProcess
 if (-not $runtime) { throw 'Companion launcher is not running.' }
 $runtimeConfig = Get-CompanionConfig
 $owners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $runtimeConfig.port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)
 foreach ($ownerId in $owners) {
  if ($ownerId -eq $runtime.Id) { return }
  $listener = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
  if ($listener -and $listener.ParentProcessId -eq $runtime.Id) { return }
 }
 throw 'Companion runtime does not own its configured loopback listener.'
}

function Assert-ControlCapability {
 $runtimeConfig = Get-CompanionConfig
 $controlHeaders = @{Origin=$runtimeConfig.origin; Host=$runtimeConfig.host}
 try {
  $controlHeaders.Authorization = 'Bearer ' + (Get-ControlToken)
  $capability = Invoke-RestMethod -Uri ("http://127.0.0.1:"+$runtimeConfig.port+"/v1/control") -Method Get -Headers $controlHeaders -TimeoutSec 5 -ErrorAction Stop
  if ($capability.protocol -ne 1 -or $capability.enabled -ne $true -or -not ($capability.actions -contains 'lock')) {
   throw 'Missing control capability'
  }
 } catch {
  # Never include HTTP exception details: they may contain authorization headers.
  throw 'Authenticated control capability could not be verified.'
 } finally {
  $controlHeaders.Clear()
 }
}

# Stage every replacement before stopping monitoring, including when invoked from $App.
$stage=Join-Path $App ('control-update-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$names=@('controls.json')
if ($Enable) {
 $source = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'agent.py')) { $PSScriptRoot } else { Split-Path $PSScriptRoot -Parent }
 foreach ($name in @('agent.py','control.py')) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination $stage }
 foreach ($name in @('common.ps1','start.ps1','share-token.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $stage }
 $names=@('agent.py','control.py','common.ps1','start.ps1','share-token.ps1','controls.json')
 $apps=@(Get-Content -LiteralPath $AllowlistPath -Raw | ConvertFrom-Json)
 [ordered]@{enabled=$true;apps=$apps} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'controls.json') -Encoding utf8
 & $python -c "import json,sys;sys.path.insert(0,sys.argv[1]);from control import validate_apps;validate_apps(json.load(open(sys.argv[2],encoding='utf-8-sig'))['apps'])" $stage (Join-Path $stage 'controls.json')
 if ($LASTEXITCODE) { throw 'Allowlist rejected; the running companion was not changed.' }
} else {
 '{"enabled":false,"apps":[]}' | Set-Content -LiteralPath (Join-Path $stage 'controls.json') -Encoding utf8
}
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $App /inheritance:r /grant:r "*${me}:(OI)(CI)F" /grant:r '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE) { throw 'Could not verify restricted install permissions.' }
$backup=Join-Path $stage 'previous'
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($name in $names){$old=Join-Path $App $name;if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination $backup}}
# Credential provisioning is explicitly part of -Enable; never rotate the read-only key.
if($Enable){New-ControlToken}
$wasRunning=[bool](Get-CompanionProcess)
try {
 if($wasRunning){Stop-ControlRuntime}
 foreach($name in $names){Copy-Item -LiteralPath (Join-Path $stage $name) -Destination $App -Force}
 & (Join-Path $App 'start.ps1')
 Assert-ControlRuntime
 if ($Enable) { Assert-ControlCapability }
 Write-Host ('Controls ' + $(if($Enable){'enabled'}else{'disabled'}) + '. Monitoring credential and Tailscale configuration unchanged.')
 Write-Host "Rollback copies retained privately in $backup"
} catch {
 try {
  # A failed start can leave the new process alive. Never restore beneath that process.
  Stop-ControlRuntime
  foreach($name in $names){$old=Join-Path $backup $name;$dest=Join-Path $App $name;if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination $dest -Force}elseif(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -ErrorAction Stop}}
  . (Join-Path $App 'common.ps1')
  if($wasRunning){& (Join-Path $App 'start.ps1'); Assert-ControlRuntime}
 } catch {
  throw "Control update and rollback did not complete. Do not assume monitoring or controls are restored. Private backup: $backup"
 }
 throw 'Control update failed; previous files and runtime state were restored and verified.'
}
