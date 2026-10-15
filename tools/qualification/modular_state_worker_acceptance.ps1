param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedHead,
    [switch]$PushWhenGreen,
    [switch]$Skip500
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$branch = 'eve/core-hardening'
$protectedSource = 'C:\Users\alvin\Downloads\New-Music-Holder\eveos-audioflix-music-2026-10-12T04-32-24-760Z.json'
$protectedSha = '745326fb387246e28350dff8f54a0719c15186076c643544b71a5f20fb86a685'
$oldRegistry = '"smoke:modular-state-sync": "node tools/smoke/modular_state_sync_payload_cache_smoke.js && node tools/smoke/modular_state_sync_sections_cache_smoke.js",'
$newRegistry = '"smoke:modular-state-sync": "node tools/smoke/modular_state_sync_payload_cache_smoke.js && node tools/smoke/modular_state_sync_sections_cache_smoke.js && node tools/smoke/modular_state_sync_worker_smoke.mjs",'

Set-Location $repo

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "STOP: command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
        $sha.Dispose()
    }
}

function Assert-ProtectedSource {
    if (-not (Test-Path -LiteralPath $protectedSource)) {
        throw "STOP: protected AudioFlix source is missing: $protectedSource"
    }
    $actual = Get-Sha256 $protectedSource
    if ($actual -ne $protectedSha) {
        throw "STOP: protected AudioFlix source SHA changed: $actual"
    }
}

function Get-TrackedChanges {
    $rows = @(git status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) { throw 'STOP: git status failed.' }
    return @($rows | ForEach-Object { $_.Substring(3) } | Sort-Object -Unique)
}

function Assert-VersionOnlyDiff {
    param([Parameter(Mandatory = $true)][string]$Path)
    $diff = @(git diff --unified=0 -- $Path)
    if ($LASTEXITCODE -ne 0) { throw "STOP: could not inspect generated diff: $Path" }
    foreach ($line in $diff) {
        if ($line.StartsWith('+++') -or $line.StartsWith('---')) { continue }
        if (-not ($line.StartsWith('+') -or $line.StartsWith('-'))) { continue }
        if ($line -notmatch '[?&]v=') {
            throw "STOP: asset-version build changed non-version content in ${Path}: $line"
        }
    }
}

function Find-Qualifier {
    $direct = Join-Path $repo 'qualify.ps1'
    if (Test-Path -LiteralPath $direct) { return $direct }
    $candidates = @(Get-ChildItem -LiteralPath $repo -Filter 'qualify.ps1' -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' } |
        Sort-Object LastWriteTime -Descending)
    if ($candidates.Count -eq 0) {
        throw 'STOP: Nova qualification wrapper qualify.ps1 was not found in this checkout.'
    }
    return $candidates[0].FullName
}

function Invoke-Qualifier {
    param(
        [Parameter(Mandatory = $true)][string]$Script,
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][int]$Iterations,
        [switch]$ScaleOnly
    )
    Write-Host ""
    Write-Host "=== QUALIFY iterations=$Iterations scaleOnly=$($ScaleOnly.IsPresent) ==="
    if ($ScaleOnly) {
        & $Script -Candidate $Candidate -Iterations $Iterations -ScaleOnly
    }
    else {
        & $Script -Candidate $Candidate -Iterations $Iterations
    }
    if ($LASTEXITCODE -ne 0) {
        throw "STOP: qualification failed at iterations=$Iterations scaleOnly=$($ScaleOnly.IsPresent)."
    }
    Assert-ProtectedSource
}

Write-Host '=== MODULAR STATE WORKER AUTOMATED ACCEPTANCE ==='

Invoke-Native git fetch origin $branch
$head = [string](@(git rev-parse HEAD)[0])
if ($LASTEXITCODE -ne 0) { throw 'STOP: HEAD lookup failed.' }
if ($head -ne $ExpectedHead) { throw "STOP: expected HEAD $ExpectedHead but found $head" }
$remote = [string](@(git rev-parse "origin/$branch")[0])
if ($LASTEXITCODE -ne 0) { throw 'STOP: remote lookup failed.' }
if ($remote -ne $ExpectedHead) { throw "STOP: remote moved before validation: $remote" }
$dirty = Get-TrackedChanges
if ($dirty.Count -ne 0) {
    git status --short
    throw 'STOP: validation must begin from a clean tracked checkout.'
}
Assert-ProtectedSource

Write-Host "IMPLEMENTATION HEAD: $head"
Write-Host "REMOTE HEAD:         $remote"

Write-Host ''
Write-Host '=== REGISTER WORKER REGRESSION ==='
$package = Join-Path $repo 'package.json'
$packageText = [IO.File]::ReadAllText($package)
if ($packageText.Contains($newRegistry)) {
    Write-Host 'Worker smoke already registered.'
}
elseif ($packageText.Contains($oldRegistry)) {
    $packageText = $packageText.Replace($oldRegistry, $newRegistry)
    [IO.File]::WriteAllText($package, $packageText, [Text.UTF8Encoding]::new($false))
    Write-Host 'Registered worker smoke in smoke:modular-state-sync.'
}
else {
    throw 'STOP: modular state sync npm registry seam changed; inspect package.json instead of guessing.'
}

Write-Host ''
Write-Host '=== STATIC CHECKS BEFORE ASSET BUILD ==='
$checks = @(
    'js/modules/features/modular-state-sync/modular-state-sync.capture.worker.js',
    'js/modules/features/modular-state-sync/modular-state-sync.capture.cache.js',
    'js/modules/features/modular-state-sync/modular-state-sync.shared.js',
    'js/modules/features/modular-state-sync/modular-state-sync.engine.sync.js',
    'js/modules/features/modular-state-sync/modular-state-sync.engine.runtime.js',
    'tools/smoke/modular_state_sync_worker_smoke.mjs',
    'tools/qualification/audioflix_source_identity.mjs'
)
foreach ($file in $checks) { Invoke-Native node --check $file }
Invoke-Native git diff --check

Write-Host ''
Write-Host '=== WORKER CONTRACT BEFORE GENERATED ASSETS ==='
Invoke-Native node tools/smoke/modular_state_sync_worker_smoke.mjs

Write-Host ''
Write-Host '=== SYNCHRONIZE RUNTIME ASSET VERSIONS ==='
Invoke-Native npm run build:asset-versions
Invoke-Native npm run --silent audit:asset-versions

$generated = Get-TrackedChanges
if ('package.json' -notin $generated) {
    throw 'STOP: expected package.json registration change is missing.'
}
foreach ($path in $generated) {
    if ($path -eq 'package.json') { continue }
    Assert-VersionOnlyDiff $path
}
Invoke-Native git diff --check

Write-Host 'Generated integration changes:'
$generated | ForEach-Object { Write-Host "  $_" }

Write-Host ''
Write-Host '=== COMMIT REGISTRY + GENERATED ASSETS ==='
& git add -- $generated
if ($LASTEXITCODE -ne 0) { throw 'STOP: staging integration changes failed.' }
Invoke-Native git diff --cached --check
& git commit --no-gpg-sign -m 'test(state-sync): register worker gate and sync assets'
if ($LASTEXITCODE -ne 0) { throw 'STOP: integration commit failed.' }
$candidate = [string](@(git rev-parse HEAD)[0])
if ($LASTEXITCODE -ne 0) { throw 'STOP: candidate lookup failed.' }
$parent = [string](@(git rev-parse "$candidate^")[0])
if ($LASTEXITCODE -ne 0) { throw 'STOP: candidate parent lookup failed.' }
if ($parent -ne $ExpectedHead) { throw "STOP: integration candidate parent mismatch: $parent" }
if ((Get-TrackedChanges).Count -ne 0) { throw 'STOP: checkout is dirty after integration commit.' }
Assert-ProtectedSource
Write-Host "VALIDATION CANDIDATE: $candidate"

Write-Host ''
Write-Host '=== AFFECTED CORRECTNESS GATES ==='
Invoke-Native npm run smoke:modular-state-sync
Invoke-Native npm run smoke:core-storage
Invoke-Native node tools/smoke/large_datapack_perf_guard_smoke.js
Invoke-Native npm run smoke:audioflix-full
Invoke-Native npm run test:guardrails
Invoke-Native node tools/smoke/audioflix_source_identity_smoke.mjs
Assert-ProtectedSource
if ((Get-TrackedChanges).Count -ne 0) {
    git status --short
    throw 'STOP: correctness gates left tracked changes.'
}

$qualifier = Find-Qualifier
Write-Host "QUALIFIER: $qualifier"
Invoke-Qualifier -Script $qualifier -Candidate $candidate -Iterations 10 -ScaleOnly
Invoke-Qualifier -Script $qualifier -Candidate $candidate -Iterations 50

if (-not $Skip500) {
    Invoke-Qualifier -Script $qualifier -Candidate $candidate -Iterations 500
}
else {
    Write-Host '500-cycle gate explicitly skipped by caller.'
}

Write-Host ''
Write-Host '=== FINAL UNCACHED VERIFY ==='
Invoke-Native npm run verify
Assert-ProtectedSource
if ((Get-TrackedChanges).Count -ne 0) {
    git status --short
    throw 'STOP: final verification left tracked changes.'
}

Invoke-Native git fetch origin $branch
$remoteBeforePush = [string](@(git rev-parse "origin/$branch")[0])
if ($LASTEXITCODE -ne 0) { throw 'STOP: final remote lookup failed.' }
if ($remoteBeforePush -ne $ExpectedHead) {
    throw "STOP: remote moved during validation: $remoteBeforePush"
}

if ($PushWhenGreen) {
    Write-Host ''
    Write-Host '=== NORMAL FAST-FORWARD PUSH ==='
    Invoke-Native git push origin 'HEAD:refs/heads/eve/core-hardening'
    Invoke-Native git fetch origin $branch
    $remoteAfterPush = [string](@(git rev-parse "origin/$branch")[0])
    if ($LASTEXITCODE -ne 0) { throw 'STOP: post-push remote lookup failed.' }
    if ($remoteAfterPush -ne $candidate) {
        throw "STOP: remote does not match validated candidate after push: $remoteAfterPush"
    }
    Write-Host "PUSHED HEAD: $remoteAfterPush"
}
else {
    Write-Host 'Push withheld (use -PushWhenGreen to publish only after all gates pass).'
}

Write-Host ''
Write-Host '========================================'
Write-Host 'MODULAR STATE WORKER ACCEPTANCE GREEN'
Write-Host '========================================'
Write-Host "IMPLEMENTATION: $ExpectedHead"
Write-Host "VALIDATED HEAD: $candidate"
Write-Host "500 RUN:        $(-not $Skip500)"
Write-Host "PUSHED:         $($PushWhenGreen.IsPresent)"
Write-Host 'PROTECTED SOURCE UNCHANGED: yes'
