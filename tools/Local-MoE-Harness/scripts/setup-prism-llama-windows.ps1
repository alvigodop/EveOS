$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ConfigPath = Join-Path $Root "config\windows-runtime.json"
$Config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$RuntimeConfig = $Config.prism_llama
if (-not $RuntimeConfig) { throw "Prism llama runtime is not declared in windows-runtime.json." }

function Assert-Hash([string]$Path, [string]$Expected) {
    $Stream = [System.IO.File]::OpenRead($Path)
    try {
        $Hasher = [System.Security.Cryptography.SHA256]::Create()
        try { $Actual = ([System.BitConverter]::ToString($Hasher.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant() }
        finally { $Hasher.Dispose() }
    }
    finally { $Stream.Dispose() }
    if ($Actual -ne $Expected.ToLowerInvariant()) {
        throw "SHA-256 mismatch for $Path. Expected $Expected, got $Actual"
    }
}

function Download-Verified([string]$Url, [string]$Path, [string]$Sha256) {
    if (Test-Path -LiteralPath $Path) {
        try { Assert-Hash $Path $Sha256; return }
        catch { Remove-Item -LiteralPath $Path -Force }
    }
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Path
    Assert-Hash $Path $Sha256
}

$Downloads = Join-Path $Root "tools\downloads"
$RuntimeRoot = Join-Path $Root "runtime\prism-llama\windows-cuda"
$TempRoot = Join-Path $Root ".tmp\prism-llama-extract"
foreach ($Path in @($Downloads, (Split-Path -Parent $RuntimeRoot), (Split-Path -Parent $TempRoot))) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

$RootPrefix = $Root.TrimEnd('\') + '\'
foreach ($Target in @($RuntimeRoot, $TempRoot)) {
    $ResolvedTarget = [System.IO.Path]::GetFullPath($Target)
    if (-not $ResolvedTarget.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing runtime setup outside the Harness root: $ResolvedTarget"
    }
}

if (Test-Path -LiteralPath $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null

foreach ($Archive in @($RuntimeConfig.archives)) {
    $ArchivePath = Join-Path $Downloads ([string]$Archive.filename)
    Download-Verified ([string]$Archive.url) $ArchivePath ([string]$Archive.sha256)
    Expand-Archive -Force -LiteralPath $ArchivePath -DestinationPath $TempRoot
}

$Server = Get-ChildItem -LiteralPath $TempRoot -Recurse -File -Filter "llama-server.exe" | Select-Object -First 1
if (-not $Server) { throw "The verified Prism runtime archives did not contain llama-server.exe." }

if (Test-Path -LiteralPath $RuntimeRoot) { Remove-Item -LiteralPath $RuntimeRoot -Recurse -Force }
Move-Item -LiteralPath $TempRoot -Destination $RuntimeRoot
$InstalledServer = Get-ChildItem -LiteralPath $RuntimeRoot -Recurse -File -Filter "llama-server.exe" | Select-Object -First 1
if (-not $InstalledServer) { throw "Prism llama-server.exe was lost during installation." }

$StatePath = Join-Path $Root "state\prism-llama-setup.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
$State = [ordered]@{
    schema_version = 1
    installed_at = [DateTimeOffset]::UtcNow.ToString("o")
    release_tag = [string]$RuntimeConfig.release_tag
    demo_commit = [string]$RuntimeConfig.demo_commit
    variant = [string]$RuntimeConfig.variant
    binary = $InstalledServer.FullName
    archives = @($RuntimeConfig.archives | ForEach-Object { "$($_.filename):$($_.sha256)" })
}
$State | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath $StatePath
Write-Host "[Prism Runtime Setup] READY: $($RuntimeConfig.release_tag) ($($RuntimeConfig.variant))"
