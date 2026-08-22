param([switch]$SmokeTest)

$ErrorActionPreference = 'Stop'
$script:Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:Cli = Join-Path $script:Root 'src\cli.js'
$script:CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }

function Invoke-RepairCli([string]$Command) {
    $output = & node --no-warnings $script:Cli $Command --home $script:CodexHome --json 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 1) { throw ($output -join [Environment]::NewLine) }
    return (($output -join [Environment]::NewLine) | ConvertFrom-Json)
}

function Get-CodexProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'ChatGPT.exe' -or ($_.Name -eq 'codex.exe' -and $_.CommandLine -match 'app-server')
    }
}

function Stop-Codex {
    $processes = @(Get-CodexProcesses)
    foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
    $deadline = (Get-Date).AddSeconds(20)
    while (@(Get-CodexProcesses).Count -gt 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (@(Get-CodexProcesses).Count -gt 0) { throw 'Codex did not exit within 20 seconds. No repair was run.' }
}

function Start-Codex {
    Start-Process explorer.exe 'shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App'
}

if ($SmokeTest) {
    if (-not (Test-Path $script:Cli)) { throw "CLI not found: $script:Cli" }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22 or newer is required.' }
    Write-Output 'GUI prerequisites OK'
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Codex Project Link Repair - Conservative Mode'
$form.Size = New-Object System.Drawing.Size(1050, 700)
$form.MinimumSize = New-Object System.Drawing.Size(850, 560)
$form.StartPosition = 'CenterScreen'

$summary = New-Object System.Windows.Forms.Label
$summary.Dock = 'Top'; $summary.Height = 40; $summary.Padding = '10,10,10,0'
$summary.Text = "Codex data directory: $script:CodexHome"

$buttons = New-Object System.Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Top'; $buttons.Height = 48; $buttons.Padding = '8,6,8,4'
$auditButton = New-Object System.Windows.Forms.Button; $auditButton.Text = 'Audit'; $auditButton.Width = 100
$repairButton = New-Object System.Windows.Forms.Button; $repairButton.Text = 'Repair and restart Codex'; $repairButton.Width = 190
$restoreButton = New-Object System.Windows.Forms.Button; $restoreButton.Text = 'Restore latest backup'; $restoreButton.Width = 160
$buttons.Controls.AddRange(@($auditButton, $repairButton, $restoreButton))

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Dock = 'Fill'; $grid.ReadOnly = $true; $grid.AllowUserToAddRows = $false
$grid.AutoSizeColumnsMode = 'Fill'; $grid.SelectionMode = 'FullRowSelect'
foreach ($column in @('Code','Thread ID','Title','Working directory','Current project','Suggested project','Reason')) { [void]$grid.Columns.Add($column, $column) }

$log = New-Object System.Windows.Forms.TextBox
$log.Dock = 'Bottom'; $log.Height = 150; $log.Multiline = $true; $log.ReadOnly = $true
$log.ScrollBars = 'Vertical'; $log.Font = New-Object System.Drawing.Font('Consolas', 9)

function Write-Log([string]$Message) { $log.AppendText("$(Get-Date -Format HH:mm:ss)  $Message`r`n") }
function Show-Report($Report) {
    $grid.Rows.Clear()
    foreach ($issue in $Report.issues) {
        [void]$grid.Rows.Add($issue.code, $issue.threadId, $issue.title, $issue.cwd, $issue.currentProjectId, $issue.suggestedProjectId, $issue.reason)
    }
    $summary.Text = "Projects $($Report.summary.projects) | Threads $($Report.summary.threads) | Issues $($Report.summary.issues) | Conservative mode"
}
function Invoke-UiAction([scriptblock]$Action) {
    try { $form.UseWaitCursor = $true; & $Action }
    catch { Write-Log $_.Exception.Message; [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Operation failed', 'OK', 'Error') }
    finally { $form.UseWaitCursor = $false }
}

$auditButton.Add_Click({ Invoke-UiAction { $report = Invoke-RepairCli 'audit'; Show-Report $report; Write-Log 'Audit completed. No data was changed.' } })
$repairButton.Add_Click({
    if ([System.Windows.Forms.MessageBox]::Show('Repair will create a backup and close Codex. Continue?', 'Confirm repair', 'YesNo', 'Warning') -ne 'Yes') { return }
    Invoke-UiAction {
        Write-Log 'Closing Codex...'; Stop-Codex
        Write-Log 'Backing up, repairing, and verifying...'; $result = Invoke-RepairCli 'repair'; Show-Report $result.after
        Write-Log "Repair completed. Backup: $($result.backupDir)"; Start-Codex
    }
})
$restoreButton.Add_Click({
    if ([System.Windows.Forms.MessageBox]::Show('Restore will close Codex and replace current indexes. Continue?', 'Confirm restore', 'YesNo', 'Warning') -ne 'Yes') { return }
    Invoke-UiAction { Stop-Codex; $result = Invoke-RepairCli 'restore'; Write-Log "Restored: $($result.backupDir)"; Start-Codex }
})

$form.Controls.Add($grid); $form.Controls.Add($log); $form.Controls.Add($buttons); $form.Controls.Add($summary)
$form.Add_Shown({ $auditButton.PerformClick() })
[void]$form.ShowDialog()
