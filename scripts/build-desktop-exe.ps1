param(
    [string]$OutputPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'CodexProjectRepair.exe')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path $env:TEMP ('codex-project-repair-sfx-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $work 'stage'
$sed = Join-Path $work 'package.sed'

try {
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'ui.zh-CN.json') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root 'src\cli.js') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root 'src\core.js') -Destination $stage

    $gui = Get-Content -LiteralPath (Join-Path $root 'CodexProjectRepair.ps1') -Raw
    $gui = $gui.Replace("'src\cli.js'", "'cli.js'")
    Set-Content -LiteralPath (Join-Path $stage 'CodexProjectRepair.ps1') -Value $gui -Encoding ascii
    $launcher = Get-Content -LiteralPath (Join-Path $root 'CodexProjectRepair.vbs') -Raw
    $launcher = $launcher.Replace('shell.Run command, 0, False', 'shell.Run command, 0, True')
    Set-Content -LiteralPath (Join-Path $stage 'CodexProjectRepair.vbs') -Value $launcher -Encoding ascii

    $outputDirectory = Split-Path -Parent $OutputPath
    if (-not (Test-Path -LiteralPath $outputDirectory)) { throw "Output directory does not exist: $outputDirectory" }
    if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }

    $sedContent = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$OutputPath
FriendlyName=Codex Project Link Repair
AppLaunched=wscript.exe //nologo CodexProjectRepair.vbs
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$stage\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
%FILE4%=
[Strings]
FILE0=CodexProjectRepair.vbs
FILE1=CodexProjectRepair.ps1
FILE2=ui.zh-CN.json
FILE3=cli.js
FILE4=core.js
"@
    Set-Content -LiteralPath $sed -Value $sedContent -Encoding ascii
    $process = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\iexpress.exe') -ArgumentList '/N', $sed -Wait -PassThru
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
        throw "IExpress failed with exit code $($process.ExitCode)."
    }
    Get-Item -LiteralPath $OutputPath
}
finally {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
