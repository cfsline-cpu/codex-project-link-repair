param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'))

$ErrorActionPreference = 'Stop'
$version = (Get-Content (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
$name = "codex-project-link-repair-$version"
$stage = Join-Path $OutputDirectory $name
$zip = Join-Path $OutputDirectory "$name.zip"
$files = @('CodexProjectRepair.vbs', 'CodexProjectRepair.cmd', 'CodexProjectRepair.ps1', 'ui.zh-CN.json', 'README.md', 'LICENSE', 'VERSION', 'src\cli.js', 'src\core.js')

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'src') | Out-Null
foreach ($file in $files) {
    $destination = Join-Path $stage $file
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $destination
}
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
Set-Content -Encoding ascii -Path (Join-Path $OutputDirectory 'SHA256SUMS.txt') -Value "$hash  $name.zip"
Write-Output $zip
