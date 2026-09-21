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
$GpuLayers = 32
if ($env:LOCAL_MOE_GPU_LAYERS -match '^\d+$') { $GpuLayers = [int]$env:LOCAL_MOE_GPU_LAYERS }

$BinDir = $Server.Directory.FullName
$env:PATH = "$BinDir;$env:PATH"
& $Server.FullName `
    --model $ModelPath `
    --alias $ServedModelName `
    --host "127.0.0.1" `
    --port $Port `
    --ctx-size $Context `
    --n-gpu-layers $GpuLayers `
    --flash-attn on `
    --parallel 1 `
    --temp 1.0 `
    --top-p 0.95 `
    --top-k 20 `
    --jinja
exit $LASTEXITCODE
