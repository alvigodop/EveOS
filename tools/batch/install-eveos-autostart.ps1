param(
    [switch]$Remove,
    [switch]$Quiet
)

# Keep the EveOS local control plane running from logon, so a file:// page never has to start it.
#
# A page loaded from file:// cannot launch a process. The eveos-control:// URI handler was the
# workaround, but Edge does not hand the scheme to Windows from a file:// origin -- the launch is
# declined silently, with no prompt and no error, so the page span and gave up. The same URI works
# when invoked from the OS, which is what this installs: the plane is simply already listening, and
# Enable/Start/Stop talk to it directly. The cable stays plugged in instead of being jump-started.
#
# A per-user Startup shortcut is used rather than a scheduled task: it needs no admin rights, is
# visible and removable in Task Manager > Startup, and runs as the logged-in user, which is what the
# loopback control plane wants. -Remove takes it back out.

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$launcher = Join-Path $projectRoot 'tools\batch\start-eveos-control.bat'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcut = Join-Path $startupDir 'EveOS Local Control.lnk'

if ($Remove) {
    if (Test-Path -LiteralPath $shortcut) {
        Remove-Item -LiteralPath $shortcut -Force
        if (-not $Quiet) { Write-Host 'Removed EveOS local control from startup.' }
    } elseif (-not $Quiet) {
        Write-Host 'EveOS local control was not in startup.'
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Launcher not found: $launcher"
}

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
# cmd /c so the console closes once the plane is detached; start-eveos-control.bat already
# backgrounds the server itself and exits.
$link.TargetPath = "$env:ComSpec"
$link.Arguments = '/d /c "' + $launcher + '"'
$link.WorkingDirectory = $projectRoot
$link.WindowStyle = 7          # minimized, so logon is not interrupted by a console window
$link.Description = 'Starts the EveOS local control plane (loopback, port 9082)'
$link.Save()

if (-not $Quiet) {
    Write-Host 'EveOS local control will now start when you sign in.'
    Write-Host "Shortcut: $shortcut"
    Write-Host "Launcher: $launcher"
    Write-Host ''
    Write-Host 'It is listed in Task Manager > Startup as "EveOS Local Control".'
    Write-Host 'Remove it with: tools\batch\install-eveos-autostart.bat --remove'
}
