param(
    [Parameter(Mandatory = $true)][string]$ModelPath,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$ServedModelName
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeRoot = Join-Path $Root "runtime\prism-llama\windows-cuda"
$Server = Get-ChildItem -LiteralPath $RuntimeRoot -Recurse -File -Filter "llama-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Server) { throw "Project-local Prism llama-server.exe is missing; run scripts\setup-prism-llama-windows.ps1." }
if (-not (Test-Path -LiteralPath $ModelPath -PathType Leaf)) { throw "Pinned model file is missing: $ModelPath" }
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Invalid runtime port: $Port" }

$Context = 4096
if ($env:LOCAL_MOE_KV_RESERVE_TOKENS -match '^\d+$') { $Context = [int]$env:LOCAL_MOE_KV_RESERVE_TOKENS }
$GpuLayers = "auto"
if ($env:LOCAL_MOE_GPU_LAYERS -match '^(auto|all|\d+)$') { $GpuLayers = $env:LOCAL_MOE_GPU_LAYERS }
$FitTarget = 1024
if ($env:LOCAL_MOE_GPU_FIT_TARGET_MB -match '^\d+$') { $FitTarget = [int]$env:LOCAL_MOE_GPU_FIT_TARGET_MB }

$BinDir = $Server.Directory.FullName
$env:PATH = "$BinDir;$env:PATH"
$ServerArgs = @(
    "--model", $ModelPath,
    "--alias", $ServedModelName,
    "--host", "127.0.0.1",
    "--port", "$Port",
    "--ctx-size", "$Context"
)
# Prism's default is automatic GPU fitting. Passing even the literal value
# "auto" marks n_gpu_layers as user-specified and disables the fitter.
if ($GpuLayers -ne "auto") {
    $ServerArgs += @("--n-gpu-layers", "$GpuLayers")
}
$ServerArgs += @(
    "--fit", "on",
    "--fit-target", "$FitTarget",
    "--flash-attn", "on",
    "--parallel", "1",
    "--temp", "1.0",
    "--top-p", "0.95",
    "--top-k", "20",
    "--jinja"
)
& $Server.FullName @ServerArgs
exit $LASTEXITCODE
