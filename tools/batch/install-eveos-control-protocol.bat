@echo off
setlocal EnableExtensions

set "QUIET_ARG="
if /I "%~1"=="--quiet" set "QUIET_ARG=-Quiet"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-eveos-control-protocol.ps1" %QUIET_ARG%
exit /b %ERRORLEVEL%
