Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$smokes = @(
    'tools\smoke\backup_restore_target_remap_browser_smoke.js',
    'tools\smoke\backup_restore_reload_persistence_browser_smoke.js'
)

Push-Location $repoRoot
try {
    foreach ($smoke in $smokes) {
        Write-Host "Running $smoke"
        & node $smoke
        if ($LASTEXITCODE -ne 0) {
            throw "Smoke failed: $smoke (exit code $LASTEXITCODE)"
        }
    }
}
finally {
    Pop-Location
}
