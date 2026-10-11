param([string]$Destination)
$ErrorActionPreference = 'Stop'
$bridgeSkillHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$bridgeSkillFolder = if ($Destination) { [System.IO.Path]::GetFullPath($Destination) } else { Join-Path $bridgeSkillHome 'skills/context-bridge' }
New-Item -ItemType Directory -Path $bridgeSkillFolder -Force | Out-Null
$bridgeSkillText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'skill/SKILL.md') -Raw -Encoding UTF8
$bridgeSkillText = $bridgeSkillText.Replace('{{CONTEXT_BRIDGE_ROOT}}', $PSScriptRoot)
[System.IO.File]::WriteAllText((Join-Path $bridgeSkillFolder 'SKILL.md'), $bridgeSkillText, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('Skill installed in ' + $bridgeSkillFolder)
