param(
    [switch]$Remove,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$launcher = Join-Path $projectRoot 'tools\batch\eveos-control-protocol.bat'
$schemeRoot = 'HKCU:\Software\Classes\eveos-control'

if ($Remove) {
    if (Test-Path -LiteralPath $schemeRoot) {
        Remove-Item -LiteralPath $schemeRoot -Recurse -Force
    }
    if (-not $Quiet) {
        Write-Host 'Removed the EveOS local-control protocol for this Windows user.'
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Protocol launcher not found: $launcher"
}

$commandKey = Join-Path $schemeRoot 'shell\open\command'
New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $schemeRoot -Value 'URL:EveOS Local Control'
New-ItemProperty -Path $schemeRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

# The URI argument is deliberately omitted. A web page can request startup, but it
# cannot inject command-line data into the fixed EveOS launcher.
$command = ('"{0}" /d /c ""{1}""' -f $env:ComSpec, $launcher)
Set-Item -Path $commandKey -Value $command

if (-not $Quiet) {
    Write-Host 'Registered eveos-control:// for this Windows user.'
    Write-Host "Launcher: $launcher"
}
