@echo off
setlocal EnableExtensions

rem Install (or with --remove, uninstall) the logon entry that keeps EveOS local control running.
rem See install-eveos-autostart.ps1 for why this exists rather than a browser-triggered launch.

set "EXTRA_ARGS="
if /I "%~1"=="--remove" set "EXTRA_ARGS=-Remove"
if /I "%~1"=="--quiet" set "EXTRA_ARGS=-Quiet"
if /I "%~2"=="--quiet" set "EXTRA_ARGS=%EXTRA_ARGS% -Quiet"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-eveos-autostart.ps1" %EXTRA_ARGS%
exit /b %ERRORLEVEL%
