# Shared paths and helpers for the JANGE companion scripts (current Windows user only).
# %USERPROFILE%\.jange (not AppData): packaged apps get AppData redirected, the profile root is not.
$App = Join-Path $env:USERPROFILE '.jange\companion'
$TokenFile = Join-Path $App 'token.dpapi'
$ConfigFile = Join-Path $App 'config.json'
$PidFile = Join-Path $App 'companion.pid'
$Tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'

# The token is stored with Windows DPAPI (CurrentUser scope): only this Windows
# account on this PC can decrypt it. It is never written to the console or logs.
function Get-PairingToken {
    if (-not (Test-Path $TokenFile)) { throw 'No pairing token yet. Run install.ps1 first.' }
    $secure = Get-Content $TokenFile | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function New-PairingToken {
    $bytes = [byte[]]::new(32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    # 32 random bytes as URL-safe base64: 43 characters, about 256 bits.
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    ConvertTo-SecureString $token -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $TokenFile -Encoding ascii
}

function Get-CompanionConfig { Get-Content $ConfigFile -Raw | ConvertFrom-Json }

function Get-CompanionProcess {
    if (-not (Test-Path $PidFile)) { return $null }
    $proc = Get-Process -Id ([int](Get-Content $PidFile)) -ErrorAction SilentlyContinue
    if ($proc -and $proc.Path -and $proc.Path.StartsWith($App, [StringComparison]::OrdinalIgnoreCase)) { return $proc }
    return $null
}
