@echo off
setlocal EnableExtensions

cd /d "%~dp0..\.."
set "PROJECT_ROOT=%CD%"
call "%PROJECT_ROOT%\tools\batch\eveos-ports.bat"
call "%PROJECT_ROOT%\tools\batch\eveos-python.bat"
if errorlevel 1 (
    echo ERROR: Python not found. Install Python or create the documented .venv.
    pause
    exit /b 1
)
set "CONTROL_PORT=%~1"
if "%CONTROL_PORT%"=="" set "CONTROL_PORT=%GEMINI_CONTROL_PORT%"
if "%CONTROL_PORT%"=="" set "CONTROL_PORT=9082"

netstat -ano | findstr ":%CONTROL_PORT%" | find "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Gemini file-mode control helper is already listening on port %CONTROL_PORT%.
    echo URL: http://127.0.0.1:%CONTROL_PORT%/api/gemini-server/status
    pause
    exit /b 0
)

echo Starting Gemini file-mode control helper...
echo URL: http://127.0.0.1:%CONTROL_PORT%/api/gemini-server/status
echo.
"%EVEOS_PYTHON%" server/gemini-control-helper.py %CONTROL_PORT%
