# Isolated orchestration tests: no real Python, credentials, ACL changes or runtime.
$ErrorActionPreference='Stop'
$sourcePath=Join-Path $PSScriptRoot 'install-controls.ps1'
$tokens=$null; $errors=$null
[void][Management.Automation.Language.Parser]::ParseFile($sourcePath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$source=(Get-Content -LiteralPath $sourcePath -Raw).Replace("'venv\Scripts\python.exe'","'validator.ps1'")
$source=$source.Replace('([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)','$global:ControlInstallMock.Elevated')
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('jange-installer-mock-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
function icacls { $global:LASTEXITCODE=0 }
function Assert-Mock($condition,$message){if(-not $condition){throw $message}}
# Evaluate only the two argument assignments from start.ps1, never its startup code.
& {
 $startTokens=$null; $startErrors=$null
 $startAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'start.ps1'),[ref]$startTokens,[ref]$startErrors)
 Assert-Mock ($startErrors.Count -eq 0) 'start.ps1 syntax error'
 $assignments=@($startAst.FindAll({param($n)
  $n -is [Management.Automation.Language.AssignmentStatementAst] -and
  $n.Left -is [Management.Automation.Language.VariableExpressionAst] -and
  $n.Left.VariablePath.UserPath -eq 'arguments'
 },$true))
 Assert-Mock ($assignments.Count -eq 2) 'Expected exactly two startup argument assignments'
 $App='C:\Mock User\Jange Companion'
 $ControlConfigFile=Join-Path $App 'controls.json'
 $cfg=[pscustomobject]@{port=8765;origin='https://example.test';host='pc.example.ts.net'}
 . ([scriptblock]::Create($assignments[0].Extent.Text))
 $expected=@(('"'+(Join-Path $App 'agent.py')+'"'),'--port','8765','--origin',$cfg.origin,'--host',$cfg.host)
 Assert-Mock ($arguments.Count -eq 7 -and ($arguments -join '|') -eq ($expected -join '|')) 'Monitoring argument boundaries changed'
 . ([scriptblock]::Create($assignments[1].Extent.Text))
 $expected+=@('--control-config',('"'+$ControlConfigFile+'"'))
 Assert-Mock ($arguments.Count -eq 9 -and ($arguments -join '|') -eq ($expected -join '|')) 'Control argument boundaries changed'
 Assert-Mock (-not ($arguments -contains '"')) 'Standalone quote argument'
 Write-Output 'PASS startup-argument-boundaries (paths with spaces)'
}
$common=@'
$App=$global:ControlInstallMock.App
$TokenFile=Join-Path $App 'mock-read-token'
function Get-CompanionProcess {if($global:ControlInstallMock.Running){[pscustomobject]@{Id=424200}}}
function Get-CompanionConfig {[pscustomobject]@{port=8765;origin='https://example.test';host='pc.example.ts.net'}}
function Get-ControlToken { 'fixture-control-value' }
function Invoke-RestMethod {param($Uri,$Method,$Headers,$TimeoutSec,$ErrorAction)
 if($Uri -ne 'http://127.0.0.1:8765/v1/control' -or $Method -ne 'Get' -or $Headers.Origin -ne 'https://example.test' -or $Headers.Host -ne 'pc.example.ts.net' -or $Headers.Authorization -ne 'Bearer fixture-control-value'){throw 'Incorrect verification request'}
 $global:ControlInstallMock.Checks++
 if($global:ControlInstallMock.Mode -eq 'missing-capability'){return [pscustomobject]@{protocol=1;enabled=$false;actions=@()}}
 if($global:ControlInstallMock.Mode -eq 'auth-failure'){throw 'fixture-control-value must never appear in diagnostics'}
 [pscustomobject]@{protocol=1;enabled=$true;actions=@('lock')}
}
function New-ControlToken {$global:ControlInstallMock.Credentials++}
function Get-CimInstance {param($ClassName,$Filter)
 if($Filter -like 'ParentProcessId*'){if($global:ControlInstallMock.Running){[pscustomobject]@{ProcessId=424201}}}
 else{[pscustomobject]@{ParentProcessId=424200}}
}
function Get-Process {param($Id,$ErrorAction) if($global:ControlInstallMock.Running){[pscustomobject]@{Id=424200}}}
function Get-NetTCPConnection {param($LocalAddress,$LocalPort,$State,$ErrorAction)
 $m=$global:ControlInstallMock
 if($m.Running -and -not($m.Mode -eq 'bad-restored' -and $m.Starts -gt 1)){[pscustomobject]@{OwningProcess=424201}}
}
'@
$start=@'
$m=$global:ControlInstallMock
$v=(Get-Content -LiteralPath (Join-Path $m.App 'agent.py') -Raw).Trim()
$m.Log.Add('start:'+$v);$m.Starts++;$m.Running=$true
if($m.Starts -eq 1 -and $m.Mode -in @('fail-first','stop-fails','bad-restored')){throw 'Injected startup failure after spawn'}
'@
$stop=@'
$m=$global:ControlInstallMock
$v=(Get-Content -LiteralPath (Join-Path $m.App 'agent.py') -Raw).Trim()
$m.Log.Add('stop:'+$v);$m.Stops++
if($m.Mode -eq 'initial-stop' -and $m.Stops -eq 1){$m.Running=$false;throw 'Injected partial initial stop failure'}
if(-not($m.Mode -eq 'stop-fails' -and $m.Starts -gt 0)){$m.Running=$false}
'@
try{
 foreach($case in @('repo-enable','installed-enable','installed-disable','rollback','stop-fails','bad-restored','initially-stopped','elevated','missing-capability','auth-failure','initial-stop')){
  $base=Join-Path $testRoot $case;$app=Join-Path $base 'installed';$repo=Join-Path $base 'repo';$scripts=Join-Path $repo 'windows'
  New-Item -ItemType Directory -Path $app,$scripts -Force | Out-Null
  $mode=if($case -in @('repo-enable','installed-enable','installed-disable')){'success'}elseif($case -in @('stop-fails','bad-restored','missing-capability','auth-failure','initial-stop')){$case}else{'fail-first'}
  $global:ControlInstallMock=@{App=$app;Running=($case -ne 'initially-stopped');Starts=0;Stops=0;Credentials=0;Checks=0;Elevated=($case -eq 'elevated');Mode=$mode;Log=[Collections.Generic.List[string]]::new()}
  foreach($dir in @($app,$scripts)){
   Set-Content -LiteralPath (Join-Path $dir 'common.ps1') -Value $common
   Set-Content -LiteralPath (Join-Path $dir 'start.ps1') -Value $start
   Set-Content -LiteralPath (Join-Path $dir 'share-token.ps1') -Value '# no credentials'
   Set-Content -LiteralPath (Join-Path $dir 'install-controls.ps1') -Value $source
  }
  Set-Content -LiteralPath (Join-Path $app 'stop.ps1') -Value $stop
  Set-Content -LiteralPath (Join-Path $app 'validator.ps1') -Value 'param($c,$stage,$config) $global:LASTEXITCODE=0'
  Set-Content -LiteralPath (Join-Path $app 'mock-read-token') -Value 'fixture-only'
  Set-Content -LiteralPath (Join-Path $app 'agent.py') -Value 'old'
  Set-Content -LiteralPath (Join-Path $app 'control.py') -Value 'old-control'
  Set-Content -LiteralPath (Join-Path $app 'controls.json') -Value '{"enabled":false,"apps":[]}'
  Set-Content -LiteralPath (Join-Path $repo 'agent.py') -Value 'new'
  Set-Content -LiteralPath (Join-Path $repo 'control.py') -Value 'new-control'
  $allowlist=Join-Path $base 'apps.json';Set-Content -LiteralPath $allowlist -Value '[]'
  $entry=if($case -like 'installed-*'){Join-Path $app 'install-controls.ps1'}else{Join-Path $scripts 'install-controls.ps1'}
  if($case -eq 'installed-disable'){Remove-Item -LiteralPath (Join-Path $app 'control.py')}
  $failure=$null
  try{if($case -eq 'installed-disable'){& $entry -Disable}else{& $entry -Enable -AllowlistPath $allowlist}}catch{$failure=$_.Exception.Message}
  $m=$global:ControlInstallMock;$version=(Get-Content -LiteralPath (Join-Path $app 'agent.py') -Raw).Trim()
  if($case -eq 'elevated'){
   Assert-Mock ($failure -like '*non-elevated*') 'Elevated enable was not rejected'
   Assert-Mock ($m.Starts -eq 0 -and $m.Credentials -eq 0) 'Elevated enable touched runtime or credentials'
   Assert-Mock (@(Get-ChildItem -LiteralPath $app -Directory -Filter 'control-update-*').Count -eq 0) 'Elevated enable staged files'
  }elseif($mode -eq 'success'){
   Assert-Mock (-not $failure) "$case unexpectedly failed: $failure"
   Assert-Mock $m.Running "$case did not start"
   $enabled=(Get-Content -LiteralPath (Join-Path $app 'controls.json') -Raw|ConvertFrom-Json).enabled
   Assert-Mock ($enabled -eq ($case -ne 'installed-disable')) "$case configuration incorrect"
   Assert-Mock ($m.Credentials -eq [int]($case -ne 'installed-disable')) "$case provisioning incorrect"
   Assert-Mock ($m.Checks -eq [int]($case -ne 'installed-disable')) "$case missing authenticated capability check"
  }elseif($case -eq 'initial-stop'){
   Assert-Mock ($failure -like '*restored and verified*') 'Initial stop failure did not complete rollback'
   Assert-Mock ($version -eq 'old' -and $m.Running -and $m.Starts -eq 1) 'Initial stop did not restore previous runtime'
   Assert-Mock ($m.Stops -eq 2 -and -not $m.Log.Contains('start:new')) 'Initial stop failure installed or launched replacement'
   Assert-Mock (-not (Get-Content -LiteralPath (Join-Path $app 'controls.json') -Raw|ConvertFrom-Json).enabled) 'Initial stop failure changed configuration'
  }elseif($case -eq 'stop-fails'){
   Assert-Mock ($failure -like '*rollback did not complete*') 'Failed stop was not reported'
   Assert-Mock ($version -eq 'new') 'Files restored under a running new process'
   Assert-Mock ($m.Starts -eq 1) 'Restart attempted after failed stop'
  }else{
   Assert-Mock ($version -eq 'old') "$case did not restore files"
   Assert-Mock ($m.Log.Contains('stop:new')) "$case did not stop new runtime"
   if($case -eq 'initially-stopped'){Assert-Mock (-not $m.Running -and $m.Starts -eq 1) 'Originally stopped state changed'}
   else{Assert-Mock ($m.Log.IndexOf('stop:new') -lt $m.Log.LastIndexOf('start:old')) 'Rollback restarted before stopping new runtime'}
   if($case -eq 'bad-restored'){Assert-Mock ($failure -like '*rollback did not complete*') 'Unhealthy rollback reported verified'}
   else{Assert-Mock ($failure -like '*restored and verified*') "$case wrong outcome: $failure"}
  }
  Assert-Mock ($failure -notlike '*fixture-control-value*') 'Credential leaked in diagnostics'
  Write-Output "PASS $case"
 }
}finally{
 Remove-Variable ControlInstallMock -Scope Global -ErrorAction SilentlyContinue
 $resolved=[IO.Path]::GetFullPath($testRoot)
 $tempBase=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if(-not $resolved.StartsWith($tempBase,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'jange-installer-mock-*'){throw 'Unexpected cleanup path'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
