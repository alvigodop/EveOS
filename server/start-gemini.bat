@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if not exist "%~dp0server-menu.bat" (
    echo ERROR: server-menu.bat not found in %~dp0
    pause
    exit /b 1
)

if "%~1"=="" (
    rem Default: start all Gemini backend servers.
    call "%~dp0server-menu.bat" 6
    exit /b %ERRORLEVEL%
)

rem Forward any provided option to the canonical Gemini backend menu script.
call "%~dp0server-menu.bat" %*
exit /b %ERRORLEVEL%
