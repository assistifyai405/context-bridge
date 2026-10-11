$ErrorActionPreference = 'Stop'
$bridgeShell = New-Object -ComObject WScript.Shell
$bridgeShortcut = $bridgeShell.CreateShortcut((Join-Path $PSScriptRoot 'Verder met Context Bridge.lnk'))
$bridgeShortcut.TargetPath = (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe')
$bridgeShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'launch.ps1') + '"'
$bridgeShortcut.WorkingDirectory = $PSScriptRoot
$bridgeShortcut.WindowStyle = 7
$bridgeShortcut.Description = 'Zet de ingestelde chat over en open de nieuwe Codex-chat.'
$bridgeShortcut.Save()
Write-Output 'Snelkoppeling gemaakt: Verder met Context Bridge.lnk'
