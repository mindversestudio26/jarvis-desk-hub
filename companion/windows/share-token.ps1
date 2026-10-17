<#
.SYNOPSIS
  Moves the read-only pairing token to the iPad without printing it anywhere.
.PARAMETER Via
  Window    - show it in a private window on this PC (type or copy it from there)
  Clipboard - copy it to this PC's clipboard
  Taildrop  - send it as a small file to your iPad over your private tailnet
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File share-token.ps1 -Via Taildrop -Device ipad-gen-7
#>
param(
    [ValidateSet('Window', 'Clipboard', 'Taildrop')][string]$Via = 'Window',
    [string]$Device = 'ipad-gen-7',
    [ValidateSet('ReadOnly','Control')][string]$Kind = 'ReadOnly'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
if ($Device -notmatch '\A[a-zA-Z0-9-]{1,63}\z') { throw "Unexpected device name '$Device'." }
$outbox = Join-Path $App 'outbox'
# A send interrupted by a crash or power loss could leave a token file behind.
Remove-Item (Join-Path $outbox '*') -Force -ErrorAction SilentlyContinue
$token = if ($Kind -eq 'Control') { Get-ControlToken } else { Get-PairingToken }
$transferName = if ($Kind -eq 'Control') { 'JANGE-control-token.txt' } else { 'JANGE-pairing-token.txt' }

# Copies the token without adding it to Windows clipboard history or cloud clipboard sync.
function Copy-Token {
    Add-Type -AssemblyName System.Windows.Forms
    $data = New-Object Windows.Forms.DataObject
    $data.SetText($token)
    $data.SetData('CanIncludeInClipboardHistory', (New-Object IO.MemoryStream (, [byte[]](0, 0, 0, 0))))
    $data.SetData('CanUploadToCloudClipboard', (New-Object IO.MemoryStream (, [byte[]](0, 0, 0, 0))))
    $data.SetData('ExcludeClipboardContentFromMonitorProcessing', (New-Object IO.MemoryStream (, [byte[]](1, 0, 0, 0))))
    [Windows.Forms.Clipboard]::SetDataObject($data, $true)
}
function Clear-TokenClipboard { if ((Get-Clipboard -Raw) -eq $token) { Set-Clipboard -Value $null } }

try {
switch ($Via) {
    'Clipboard' {
        Copy-Token
        Write-Host 'Token copied. Paste it into JANGE now: the clipboard is cleared in 60 seconds.'
        Start-Sleep -Seconds 60
    }
    'Taildrop' {
        New-Item -ItemType Directory -Force -Path $outbox | Out-Null
        $file = Join-Path $outbox $transferName
        try {
            Set-Content -Path $file -Value $token -NoNewline -Encoding ascii
            & $Tailscale file cp $file "${Device}:"
            if ($LASTEXITCODE) { throw "Taildrop to $Device failed." }
        } finally {
            Remove-Item $file -Force -ErrorAction SilentlyContinue
        }
        Write-Host "Sent to $Device. On the iPad open Files > Tailscale, open $transferName, copy the text, paste it into JANGE, then delete the file."
    }
    'Window' {
        Add-Type -AssemblyName System.Windows.Forms, System.Drawing
        $form = New-Object Windows.Forms.Form -Property @{ Text = 'JANGE pairing token'; Width = 760; Height = 220; StartPosition = 'CenterScreen'; TopMost = $true }
        $box = New-Object Windows.Forms.TextBox -Property @{ Text = $token; ReadOnly = $true; Font = New-Object Drawing.Font('Consolas', 18); Left = 20; Top = 20; Width = 700 }
        $copy = New-Object Windows.Forms.Button -Property @{ Text = 'Copy'; Left = 20; Top = 80; Width = 120; Height = 40 }
        $done = New-Object Windows.Forms.Button -Property @{ Text = 'Done'; Left = 600; Top = 80; Width = 120; Height = 40 }
        $copy.Add_Click({ Copy-Token })
        $done.Add_Click({ $form.Close() })
        $form.Controls.AddRange(@($box, $copy, $done))
        [void]$form.ShowDialog()
    }
}
} finally {
    try {
        if ($Via -in @('Clipboard', 'Window')) { Clear-TokenClipboard }
    } finally {
        try {
            if ($box) { $box.Text = '' }
        } finally {
            try { if ($form) { $form.Dispose() } }
            finally { Remove-Variable token -ErrorAction SilentlyContinue }
        }
    }
}
