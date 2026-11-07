# Windows PowerShell 5.1+; run from any folder. No Git, network or database operations.
[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
$baselineName = 'docs/release-baseline-v60.16.0.json'
$baseline = Get-Content -LiteralPath (Join-Path $root $baselineName) -Raw -Encoding UTF8 | ConvertFrom-Json
if ($baseline.version -ne '60.16.0' -or !$baseline.files.Count) { throw 'Missing or invalid 60.16.0 release inventory.' }
if (!$OutputPath) {
    $OutputPath = Join-Path (Split-Path -Parent $root) ('SINGH-ACADEMY-COMPLETE-CLEAN-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
}
$target = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $target) { throw 'Output already exists. Choose another OutputPath; existing files will not be overwritten.' }
$files = @($baseline.files | ForEach-Object { $_.path }) + @($baselineName)
if (Test-Path -LiteralPath (Join-Path $root 'frontend/next-env.d.ts')) { $files += 'frontend/next-env.d.ts' }
# Keep the small final summaries/audits, not historical reports or screenshots.
$evidence = 'qa/v60.16.0-r8/evidence/'
foreach ($name in @('verification-summary.json', 'verify.log', 'integration.log', 'browser-ui.log', 'browser-db.log', 'security-audit.json', 'audit-backend-full.json', 'audit-backend-production.json', 'audit-frontend-full.json', 'audit-frontend-production.json', 'visual/visual-qa.json', 'clean-package-verify.log', 'paypal-official-schema-validation.json')) {
    if (Test-Path -LiteralPath (Join-Path $root ($evidence + $name))) { $files += $evidence + $name }
}
$files = @($files | Sort-Object -Unique)
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('singh-clean-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $temporaryRoot 'SINGH-ACADEMY'
$rootPrefix = $root + [IO.Path]::DirectorySeparatorChar
$changed = 0
try {
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    foreach ($relative in $files) {
        if ($relative -match '(^|/)(\.\.?|\.git|node_modules|\.next|\.next-ui-tests|backups|\.tmp-uploads)(/|$)') { throw 'Unsafe inventory entry.' }
        $source = [IO.Path]::GetFullPath((Join-Path $root $relative))
        if (!$source.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Inventory path escapes the project.' }
        $item = Get-Item -LiteralPath $source -Force
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Package inputs must be ordinary files.' }
        $parent = $item.Directory
        while ($parent -and $parent.FullName.Length -ge $root.Length) {
            if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Package inputs cannot pass through a linked directory.' }
            if ($parent.FullName.Equals($root, [StringComparison]::OrdinalIgnoreCase)) { break }
            $parent = $parent.Parent
        }
        if ($item.Name -match '^\.env($|\.)' -and !$item.Name.EndsWith('.example')) { throw 'Private environment files cannot be packaged.' }
        $destination = Join-Path $stage $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        [IO.File]::Copy($source, $destination, $false)
    }
    foreach ($entry in $baseline.files) {
        if ((Get-FileHash -LiteralPath (Join-Path $stage $entry.path) -Algorithm SHA256).Hash -ne $entry.sha256) { $changed++ }
    }
    if ($changed) { Write-Warning "$changed files differ from the recorded release. Your local edits were preserved; npm run verify will report integrity differences." }
    # Next regenerates this file. Omit references to build output absent in a clean ZIP.
    $nextEnv = Join-Path $stage 'frontend/next-env.d.ts'
    if (Test-Path -LiteralPath $nextEnv) {
        $content = [IO.File]::ReadAllText($nextEnv) -replace '(?m)^/// <reference path="\./\.next[^\r\n]*\r?\n', ''
        [IO.File]::WriteAllText($nextEnv, $content, (New-Object Text.UTF8Encoding($false)))
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $target, [IO.Compression.CompressionLevel]::Optimal, $true)
    $archive = [IO.Compression.ZipFile]::OpenRead($target)
    try { if ($archive.Entries.Count -lt $files.Count) { throw 'ZIP inventory is incomplete.' } }
    finally { $archive.Dispose() }
    Write-Host "Complete clean project ZIP: $target"
    Write-Host "Included files: $($files.Count). Source folder and private configuration were preserved."
    Get-FileHash -LiteralPath $target -Algorithm SHA256
}
finally {
    if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}
