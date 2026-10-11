param([switch]$SkipSkill)
$ErrorActionPreference = 'Stop'
try {
    Get-Command node -ErrorAction Stop | Out-Null
    Get-Command git -ErrorAction Stop | Out-Null
    $bridgeNpm = (Get-Command npm.cmd -ErrorAction Stop).Source
    Push-Location -LiteralPath $PSScriptRoot
    try {
        & $bridgeNpm ci --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
        & node scripts/setup.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Dependency setup failed.' }
        & node --import tsx src/cli.ts doctor
        if ($LASTEXITCODE -ne 0) { throw 'Installation verification failed.' }
        & (Join-Path $PSScriptRoot 'install-launcher.ps1')
        if (-not $SkipSkill) { & (Join-Path $PSScriptRoot 'install-skill.ps1') }
    } finally { Pop-Location }
    Write-Output 'Context Bridge is installed. Open the shortcut to choose a chat.'
} catch { Write-Error $_.Exception.Message; exit 1 }
