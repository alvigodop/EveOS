@echo off
setlocal EnableExtensions

cd /d "%~dp0"
call "%~dp0eveos-ports.bat"
call "%~dp0eveos-python.bat"
if errorlevel 1 (
    echo ERROR: Python not found. Install Python or create the documented .venv.
    pause
    exit /b 1
)
if not defined GEMINI_CONTROL_PORT set "GEMINI_CONTROL_PORT=9082"

if not exist "%~dp0server-menu.bat" (
    echo ERROR: server-menu.bat not found in %~dp0
    pause
    exit /b 1
)

if "%~1"=="" (
    rem Default: start all Gemini backend servers.
    call :EnsureControlHelper
    call "%~dp0server-menu.bat" 6
    exit /b %ERRORLEVEL%
)

if "%~1"=="1" call :EnsureControlHelper
if "%~1"=="3" call :EnsureControlHelper
if "%~1"=="6" call :EnsureControlHelper
if "%~1"=="10" call :EnsureControlHelper

rem Forward any provided option to the canonical Gemini backend menu script.
call "%~dp0server-menu.bat" %*
exit /b %ERRORLEVEL%

:EnsureControlHelper
call "%~dp0start-eveos-control.bat" %GEMINI_CONTROL_PORT%
exit /b 0
