$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\alvin\Documents\Workspace\RoughProjDeving\EveOS-0.4'
$lightpandaBin = Join-Path $repo 'bin\lightpanda'
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue; $pythonExe = if ($pythonCmd) { $pythonCmd.Source } else { $null }
$pyCmd = Get-Command py -ErrorAction SilentlyContinue; if (-not $pythonExe -and $pyCmd) { $pythonExe = $pyCmd.Source }
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue; $nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { $null }
$wslCmd = Get-Command wsl -ErrorAction SilentlyContinue; $wslExe = if ($wslCmd) { $wslCmd.Source } else { $null }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script as Administrator.'
}

Write-Host 'Adding Windows Defender exclusions...'
$exclusionPaths = @($repo, $lightpandaBin) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
foreach ($path in $exclusionPaths) {
    try { Add-MpPreference -ExclusionPath $path } catch { Write-Warning $_ }
}

$exclusionProcesses = @($pythonExe, $nodeExe, $wslExe, $lightpandaBin) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
foreach ($proc in $exclusionProcesses) {
    try { Add-MpPreference -ExclusionProcess $proc } catch { Write-Warning $_ }
}

Write-Host 'Adding Windows Firewall rules...'
$apps = @(
    @{ Name = 'EveOS Python'; Path = $pythonExe },
    @{ Name = 'EveOS Node'; Path = $nodeExe },
    @{ Name = 'EveOS WSL'; Path = $wslExe },
    @{ Name = 'EveOS Lightpanda'; Path = $lightpandaBin }
) | Where-Object { $_.Path -and (Test-Path $_.Path) }

foreach ($app in $apps) {
    $ruleBase = "EveOS-Allow-$($app.Name)"
    if (-not (Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue | Where-Object { $_.Program -eq $app.Path })) {
        New-NetFirewallRule -DisplayName "$ruleBase-In" -Direction Inbound -Action Allow -Program $app.Path -Profile Any | Out-Null
        New-NetFirewallRule -DisplayName "$ruleBase-Out" -Direction Outbound -Action Allow -Program $app.Path -Profile Any | Out-Null
    }
}

$ports = @(3037, 3000, 3001, 3002, 3003, 3004, 3005)
foreach ($port in $ports) {
    $inName = "EveOS-Allow-Port-$port-In"
    $outName = "EveOS-Allow-Port-$port-Out"
    if (-not (Get-NetFirewallRule -DisplayName $inName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $inName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any | Out-Null
    }
    if (-not (Get-NetFirewallRule -DisplayName $outName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $outName -Direction Outbound -Action Allow -Protocol TCP -RemotePort $port -Profile Any | Out-Null
    }
}

Write-Host ''
Write-Host 'Done for Windows Defender and Windows Firewall.' -ForegroundColor Green
Write-Host 'Still do this manually in Webroot SecureAnywhere:' -ForegroundColor Yellow
Write-Host '  1. Allow/ignore the repo folder:' $repo
Write-Host '  2. Allow/ignore:' $lightpandaBin
Write-Host '  3. Allow/ignore: python.exe, node.exe, wsl.exe'
Write-Host '  4. Allow loopback / localhost and WSL private-network traffic if Webroot prompts'

