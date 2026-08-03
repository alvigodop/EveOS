@echo off
setlocal EnableExtensions

rem Compatibility wrapper: the old Gemini helper is now the general EveOS control plane.
call "%~dp0start-eveos-control.bat" %*
exit /b %ERRORLEVEL%
