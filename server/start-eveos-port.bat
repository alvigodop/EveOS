@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH.
    echo Install Python from https://www.python.org/downloads/
    echo Make sure "Add Python to PATH" is enabled.
    pause
    exit /b 1
)

set "PORT_INPUT=%~1"
if "%PORT_INPUT%"=="" (
    set /p "PORT_INPUT=Port (default 8765): "
)
if "%PORT_INPUT%"=="" set "PORT_INPUT=8765"

echo %PORT_INPUT%| findstr /r "^[0-9][0-9]*$" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Port must be numeric.
    pause
    exit /b 1
)

set /a PORT_VALUE=%PORT_INPUT%+0 >nul 2>nul
if %PORT_VALUE% LSS 1 (
    echo ERROR: Port must be between 1 and 65535.
    pause
    exit /b 1
)
if %PORT_VALUE% GTR 65535 (
    echo ERROR: Port must be between 1 and 65535.
    pause
    exit /b 1
)

netstat -ano | findstr ":%PORT_VALUE%" | find "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ERROR: Port %PORT_VALUE% is already in use.
    pause
    exit /b 1
)

echo Starting EveOS at http://127.0.0.1:%PORT_VALUE%/EveOS.html
echo Data-pack: current active modular data-pack
echo.
python server/python-server.py %PORT_VALUE%
