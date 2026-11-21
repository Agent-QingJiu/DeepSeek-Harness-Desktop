param([Parameter(Mandatory)][string]$Artifacts, [Parameter(Mandatory)][string]$Evidence,
      [Parameter(Mandatory)][string]$TestModules)
$ErrorActionPreference = 'Stop'
$Artifacts = (Resolve-Path $Artifacts).Path
$Evidence = (New-Item -ItemType Directory -Force $Evidence).FullName
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scratch = Join-Path $env:RUNNER_TEMP ('dsh-qa-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $scratch 'Application'
$testHome = Join-Path $scratch 'Home'
New-Item -ItemType Directory -Path $scratch,$testHome | Out-Null
$setup = Join-Path $Artifacts 'DSH-Desktop-Setup-x64.exe'
$hash = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Get-Content -Raw (Join-Path $Artifacts 'SHA256SUMS.txt')).Trim() -cne "$hash  DSH-Desktop-Setup-x64.exe") {
    throw 'Downloaded artifact digest mismatch'
}
function Invoke-Installer([string]$File, [string]$Arguments) {
    $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
    if (-not $process.WaitForExit(360000)) { throw "Installer process timed out ($($process.Id))" }
    if ($process.ExitCode -ne 0) { throw "Installer process exited $($process.ExitCode)" }
}
$os = Get-CimInstance Win32_OperatingSystem
$summary = [ordered]@{
    operatingSystem = $os.Caption
    version = $os.Version
    build = $os.BuildNumber
    hostArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    installerSha256 = $hash
    signature = (Get-AuthenticodeSignature $setup).Status.ToString()
    install = $false
    shortcuts = $false
    uninstall = $false
    checks = [ordered]@{}
}
function Save-Report { $summary | ConvertTo-Json | Set-Content (Join-Path $Evidence 'windows.json') -Encoding utf8 }
Save-Report
try {
    Invoke-Installer $setup "/S /D=$root"
    $exe = Join-Path $root 'DeepSeek Harness.exe'
    if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Installed Electron executable missing' }
    foreach ($file in @('resources/app.asar','resources/runtime/cli/bin/dsh.cmd',
            'resources/licenses/LICENSE','resources/licenses/THIRD_PARTY_NOTICES.md')) {
        if (!(Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) { throw "Missing $file" }
    }
    $run = Get-Content (Join-Path $root 'resources/runtime/versions.json') -Raw | ConvertFrom-Json
    $pins = Get-Content (Join-Path $workspace 'packaging/runtimes.json') -Raw | ConvertFrom-Json
    if ($run.node -ne $pins.nodeVersion) { throw 'Unexpected embedded Node version' }
    $standalone = Join-Path $root 'resources/runtime/primary-runtime/dependencies'
    $nodeVersion = & (Join-Path $standalone 'node/bin/node.exe') -p 'process.versions.node'
    if ($LASTEXITCODE -or $nodeVersion -cne $pins.nodeVersion) { throw 'Standalone Node runtime mismatch' }
    $pythonVersion = & (Join-Path $standalone 'python/python.exe') --version
    if ($LASTEXITCODE -or $pythonVersion -cne "Python $($pins.pythonVersion)") { throw 'Standalone Python runtime mismatch' }
    $summary.embeddedNode = $run.node
    $summary.standaloneNode = $nodeVersion
    $summary.python = $pythonVersion
    $summary.install = $true
    $shell = New-Object -ComObject WScript.Shell
    foreach ($dir in @([Environment]::GetFolderPath('DesktopDirectory'), [Environment]::GetFolderPath('Programs'))) {
        $found = @(Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -Recurse -ErrorAction Stop | Where-Object {
            $shell.CreateShortcut($_.FullName).TargetPath -eq $exe
        })
        if (!$found.Count) { throw "Missing shortcut to installed executable under $dir" }
    }
    $summary.shortcuts = $true
    Save-Report
    $checks = [ordered]@{
        native = { python (Join-Path $PSScriptRoot 'native.py') $root (Join-Path $Evidence 'native.json') }
        agent = { node (Join-Path $PSScriptRoot 'installed-agent.mjs') $root $workspace $testHome $Evidence }
        window = { node (Join-Path $PSScriptRoot 'window.mjs') $root $testHome $Evidence $TestModules }
    }
    foreach ($name in $checks.Keys) {
        & $checks[$name]
        $summary.checks[$name] = ($LASTEXITCODE -eq 0)
        Save-Report
    }
    $failed = @($checks.Keys | Where-Object { !$summary.checks[$_] })
    if ($failed.Count) { throw "Failed installed-package checks: $($failed -join ', ')" }
} finally {
    if (Test-Path -LiteralPath $root) {
        $uninstall = @(Get-ChildItem -LiteralPath $root -Filter 'Uninstall*.exe' -File)
        if ($uninstall.Count -ne 1) { throw 'Expected exactly one installed uninstaller' }
        Invoke-Installer $uninstall[0].FullName "/S _?=$root"
        $present = Test-Path -LiteralPath (Join-Path $root 'DeepSeek Harness.exe')
        if ($present) { throw 'Application executable survived uninstall' }
        $summary.uninstall = $true
    }
    Save-Report
}
