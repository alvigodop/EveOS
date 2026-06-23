@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0..\.."

set "PROJECT_ROOT=%CD%"
call "%PROJECT_ROOT%\tools\batch\eveos-ports.bat"
set "BRIDGE_PORT=%LIGHTPANDA_BRIDGE_PORT%"
if not defined BRIDGE_PORT set "BRIDGE_PORT=3037"
set "BRIDGE_SCRIPT=%PROJECT_ROOT%\server\bridges\lightpanda-bridge.py"
set "LIGHTPANDA_BIN=%PROJECT_ROOT%\bin\lightpanda"
set "ACTIVITY_LOG=%PROJECT_ROOT%\bin\lightpanda_activity.log"
set "MONITOR_TITLE=EveOS Lightpanda Monitor"

:menu
cls
echo ========================================
echo   Lightpanda Standalone Controller
echo ========================================
echo.
call :showStatus
echo.
echo [1] Start Lightpanda bridge
echo [2] Stop Lightpanda bridge
echo [3] Open shared activity monitor
echo [4] Refresh
echo [5] Exit
echo.
set /p "choice=Enter your choice: "

if "%choice%"=="1" (
    call :startBridge
    goto :menu
)
if "%choice%"=="2" (
    call :stopBridge
    goto :menu
)
if "%choice%"=="3" (
    call :openMonitor
    goto :menu
)
if "%choice%"=="4" goto :menu
if "%choice%"=="5" exit /b 0

echo.
echo [ERROR] Invalid option.
timeout /t 1 /nobreak >nul
goto :menu

:showStatus
if exist "%LIGHTPANDA_BIN%" (
    echo [STATUS] Lightpanda binary: READY
    echo          %LIGHTPANDA_BIN%
) else (
    echo [STATUS] Lightpanda binary: NOT FOUND
    echo          Expected: %LIGHTPANDA_BIN%
)

set "BRIDGE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%BRIDGE_PORT% .*LISTENING"') do (
    set "BRIDGE_PID=%%P"
    goto :showStatusPortDone
)
:showStatusPortDone
if defined BRIDGE_PID (
    echo [STATUS] Bridge: RUNNING on http://127.0.0.1:%BRIDGE_PORT% ^(PID !BRIDGE_PID!^)
    echo          Use Lightpanda in EveOS will target this bridge.
) else (
    echo [STATUS] Bridge: STOPPED
)
exit /b 0

:startBridge
if not exist "%BRIDGE_SCRIPT%" (
    echo.
    echo [ERROR] Bridge script not found:
    echo         %BRIDGE_SCRIPT%
    echo.
    pause
    exit /b 1
)
if not exist "%LIGHTPANDA_BIN%" (
    echo.
    echo [ERROR] Lightpanda binary not found:
    echo         %LIGHTPANDA_BIN%
    echo.
    pause
    exit /b 1
)

for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%BRIDGE_PORT% .*LISTENING"') do (
    echo.
    echo [INFO] Bridge already running on port %BRIDGE_PORT% ^(PID %%P^).
    timeout /t 1 /nobreak >nul
    exit /b 0
)

if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%ACTIVITY_LOG%" type nul > "%ACTIVITY_LOG%"

echo.
echo [OK] Starting Lightpanda bridge on port %BRIDGE_PORT%...
start "EveOS Lightpanda Bridge" cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""EVEOS_PROJECT_ROOT=%PROJECT_ROOT%"" && set ""PYTHONUNBUFFERED=1"" && python -u ""%BRIDGE_SCRIPT%"" %BRIDGE_PORT%"
timeout /t 2 /nobreak >nul
exit /b 0

:stopBridge
set "FOUND_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%BRIDGE_PORT% .*LISTENING"') do (
    set "FOUND_PID=%%P"
    goto :stopBridgeFound
)
:stopBridgeFound
if not defined FOUND_PID (
    echo.
    echo [INFO] Bridge is not running.
    timeout /t 1 /nobreak >nul
    exit /b 0
)

echo.
echo [OK] Stopping bridge PID %FOUND_PID%...
taskkill /F /PID %FOUND_PID% >nul 2>nul
timeout /t 1 /nobreak >nul
exit /b 0

:openMonitor
if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%ACTIVITY_LOG%" type nul > "%ACTIVITY_LOG%"
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"%MONITOR_TITLE%" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
start "%MONITOR_TITLE%" cmd /k "echo ======================================== && echo   %MONITOR_TITLE% && echo ======================================== && echo. && powershell -NoProfile -Command ""Get-Content -Path '%ACTIVITY_LOG%' -Wait -Tail 20"""
exit /b 0
