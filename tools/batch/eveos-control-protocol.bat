@echo off
setlocal EnableExtensions

rem Registered URI entrypoint. URI payloads are intentionally ignored.
call "%~dp0start-eveos-control.bat"
exit /b %ERRORLEVEL%
