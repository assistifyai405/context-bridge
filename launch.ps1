param([switch]$ListOnly)
$ErrorActionPreference = 'Stop'
$bridgeFolder = $PSScriptRoot
function Invoke-BridgeNode([string[]]$BridgeArguments, [string]$BridgeLabel) {
    $bridgeRunFile = Join-Path $bridgeRuntime ($BridgeLabel + '-' + $PID + '.json')
    $bridgeErrorFile = Join-Path $bridgeRuntime ($BridgeLabel + '-' + $PID + '.log')
    $bridgeArgs = @('--import', 'tsx', 'src/cli.ts') + $BridgeArguments
    $bridgeProcess = Start-Process -FilePath $bridgeNode -ArgumentList $bridgeArgs -WorkingDirectory $bridgeFolder -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $bridgeRunFile -RedirectStandardError $bridgeErrorFile
    if ($bridgeProcess.ExitCode -ne 0) { throw (Get-Content -LiteralPath $bridgeErrorFile -Raw) }
    return (Get-Content -LiteralPath $bridgeRunFile -Raw | ConvertFrom-Json)
}
try {
    $bridgeNode = (Get-Command node -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $bridgeFolder 'node_modules/tsx'))) {
        throw 'Dependencies ontbreken. Voer eerst npm ci --ignore-scripts uit in de Context Bridge-map.'
    }
    $bridgeRuntime = Join-Path $bridgeFolder 'runtime'
    New-Item -ItemType Directory -Path $bridgeRuntime -Force | Out-Null
    if ($env:CODEX_THREAD_ID -and -not $ListOnly) {
        $bridgeResult = Invoke-BridgeNode @('continue') 'handoff'
    } else {
        $bridgeChats = @(Invoke-BridgeNode @('chats') 'chats')
        if ($ListOnly) { Write-Output ('Beschikbare lokale chats: ' + $bridgeChats.Count); exit 0 }
        if ($bridgeChats.Count -eq 0) { throw 'Geen ondersteunde lokale Codex-chats gevonden.' }
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bridgeForm = New-Object System.Windows.Forms.Form
        $bridgeForm.Text = 'Context Bridge - kies een gesprek'
        $bridgeForm.Size = New-Object System.Drawing.Size(760, 520)
        $bridgeForm.StartPosition = 'CenterScreen'
        $bridgeForm.FormBorderStyle = 'FixedDialog'
        $bridgeForm.MaximizeBox = $false
        $bridgeHint = New-Object System.Windows.Forms.Label
        $bridgeHint.Text = 'Welk gesprek wil je meenemen naar een nieuwe chat?'
        $bridgeHint.SetBounds(20, 20, 700, 25)
        $bridgeSearch = New-Object System.Windows.Forms.TextBox
        $bridgeSearch.SetBounds(20, 55, 700, 26)
        $bridgeList = New-Object System.Windows.Forms.ListBox
        $bridgeList.SetBounds(20, 95, 700, 320)
        $bridgeList.DisplayMember = 'label'
        $bridgeList.HorizontalScrollbar = $true
        foreach ($bridgeChat in $bridgeChats) {
            $bridgeDate = [DateTimeOffset]::FromUnixTimeSeconds([long]$bridgeChat.updatedAt).LocalDateTime.ToString('dd-MM HH:mm')
            $bridgeChat | Add-Member -NotePropertyName label -NotePropertyValue ($bridgeChat.title + '  |  ' + $bridgeChat.projectRoot + '  |  ' + $bridgeDate)
            $bridgeList.Items.Add($bridgeChat) | Out-Null
        }
        $bridgeList.SelectedIndex = -1
        $bridgeContinue = New-Object System.Windows.Forms.Button
        $bridgeContinue.Text = 'Verder in nieuwe chat'
        $bridgeContinue.SetBounds(475, 435, 245, 34)
        $bridgeContinue.Enabled = $false
        $bridgeCancel = New-Object System.Windows.Forms.Button
        $bridgeCancel.Text = 'Annuleren'
        $bridgeCancel.SetBounds(20, 435, 120, 34)
        $bridgeCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $bridgeForm.CancelButton = $bridgeCancel
        $bridgeForm.AcceptButton = $bridgeContinue
        $bridgeList.Add_SelectedIndexChanged({ $bridgeContinue.Enabled = $null -ne $bridgeList.SelectedItem })
        $bridgeChoose = {
            if ($null -ne $bridgeList.SelectedItem) {
                $bridgeForm.Tag = $bridgeList.SelectedItem.id
                $bridgeForm.DialogResult = [System.Windows.Forms.DialogResult]::OK
                $bridgeForm.Close()
            }
        }
        $bridgeContinue.Add_Click($bridgeChoose)
        $bridgeList.Add_DoubleClick($bridgeChoose)
        $bridgeSearch.Add_TextChanged({
            $bridgeList.Items.Clear()
            foreach ($bridgeChat in $bridgeChats) {
                if ($bridgeChat.label.IndexOf($bridgeSearch.Text, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { $bridgeList.Items.Add($bridgeChat) | Out-Null }
            }
            $bridgeList.SelectedIndex = -1
        })
        $bridgeForm.Controls.AddRange(@($bridgeHint, $bridgeSearch, $bridgeList, $bridgeContinue, $bridgeCancel))
        if ($bridgeForm.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { $bridgeForm.Dispose(); exit 0 }
        $bridgeSelectedId = [string]$bridgeForm.Tag
        $bridgeForm.Dispose()
        if ($bridgeSelectedId -notmatch '^[a-zA-Z0-9-]+$') { throw 'Ongeldige chatselectie.' }
        $bridgeResult = Invoke-BridgeNode @('continue', '--thread', $bridgeSelectedId) 'handoff'
    }
} catch {
    if ($ListOnly) { Write-Error $_.Exception.Message; exit 1 }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Context Bridge — overdracht niet voltooid', 'OK', 'Warning') | Out-Null
    exit 1
}
