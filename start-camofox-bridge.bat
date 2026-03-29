@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0"

set "PROJECT_ROOT=%CD%"
set "BRIDGE_PORT=3038"
set "SERVER_PORT=9377"
set "BRIDGE_SCRIPT=%PROJECT_ROOT%\camofox-bridge.py"
set "RUNTIME_ROOT=%PROJECT_ROOT%\tools\camofox-runtime"
set "RUNTIME_PACKAGE=%RUNTIME_ROOT%\package.json"
set "RUNTIME_SERVER=%RUNTIME_ROOT%\node_modules\@askjo\camofox-browser\server.js"
set "ACTIVITY_LOG=%PROJECT_ROOT%\bin\camofox_activity.log"
set "MONITOR_TITLE=EveOS Camofox Monitor"

:menu
cls
echo ========================================
echo   Camofox Standalone Controller
echo ========================================
echo.
call :showStatus
echo.
echo [1] Install or update Camofox runtime
echo [2] Start Camofox bridge
echo [3] Stop Camofox bridge
echo [4] Open shared activity monitor
echo [5] Refresh
echo [6] Exit
echo.
set /p "choice=Enter your choice: "

if "%choice%"=="1" (
    call :installRuntime
    goto :menu
)
if "%choice%"=="2" (
    call :startBridge
    goto :menu
)
if "%choice%"=="3" (
    call :stopBridge
    goto :menu
)
if "%choice%"=="4" (
    call :openMonitor
    goto :menu
)
if "%choice%"=="5" goto :menu
if "%choice%"=="6" exit /b 0

echo.
echo [ERROR] Invalid option.
timeout /t 1 /nobreak >nul
goto :menu

:showStatus
if exist "%RUNTIME_SERVER%" (
    echo [STATUS] Camofox runtime: READY
    echo          %RUNTIME_SERVER%
) else (
    echo [STATUS] Camofox runtime: NOT INSTALLED
    echo          Install from option 1 before starting the bridge.
)

set "BRIDGE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%BRIDGE_PORT% .*LISTENING"') do (
    set "BRIDGE_PID=%%P"
    goto :showStatusBridgeDone
)
:showStatusBridgeDone
if defined BRIDGE_PID (
    echo [STATUS] Bridge: RUNNING on http://127.0.0.1:%BRIDGE_PORT% ^(PID !BRIDGE_PID!^)
) else (
    echo [STATUS] Bridge: STOPPED
)

set "SERVER_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%SERVER_PORT% .*LISTENING"') do (
    set "SERVER_PID=%%P"
    goto :showStatusServerDone
)
:showStatusServerDone
if defined SERVER_PID (
    echo [STATUS] Upstream camofox-browser server: RUNNING on http://127.0.0.1:%SERVER_PORT% ^(PID !SERVER_PID!^)
) else (
    echo [STATUS] Upstream camofox-browser server: STOPPED
)
exit /b 0

:installRuntime
if not exist "%RUNTIME_ROOT%" mkdir "%RUNTIME_ROOT%" >nul 2>nul
if not exist "%RUNTIME_PACKAGE%" (
    echo.
    echo [ERROR] Runtime package manifest not found:
    echo         %RUNTIME_PACKAGE%
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Installing or updating Camofox runtime...
pushd "%RUNTIME_ROOT%"
call npm install --no-package-lock --omit=dev
set "INSTALL_EXIT=%ERRORLEVEL%"
popd
if not "%INSTALL_EXIT%"=="0" (
    echo.
    echo [ERROR] Camofox runtime install failed.
    pause
    exit /b 1
)

echo.
echo [OK] Camofox runtime is ready.
timeout /t 1 /nobreak >nul
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
if not exist "%RUNTIME_SERVER%" (
    echo.
    echo [ERROR] Camofox runtime is not installed.
    echo         Run option 1 first.
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
echo [OK] Starting Camofox bridge on port %BRIDGE_PORT%...
start "EveOS Camofox Bridge" cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""EVEOS_PROJECT_ROOT=%PROJECT_ROOT%"" && python ""%BRIDGE_SCRIPT%"" %BRIDGE_PORT%"
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
) else (
    echo.
    echo [OK] Stopping bridge PID %FOUND_PID%...
    taskkill /F /PID %FOUND_PID% >nul 2>nul
)

set "SERVER_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%SERVER_PORT% .*LISTENING"') do (
    set "SERVER_PID=%%P"
    goto :stopServerFound
)
:stopServerFound
if defined SERVER_PID (
    echo [OK] Stopping upstream Camofox server PID %SERVER_PID%...
    taskkill /F /PID %SERVER_PID% >nul 2>nul
)

timeout /t 1 /nobreak >nul
exit /b 0

:openMonitor
if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%ACTIVITY_LOG%" type nul > "%ACTIVITY_LOG%"
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"%MONITOR_TITLE%" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
start "%MONITOR_TITLE%" cmd /k "echo ======================================== && echo   %MONITOR_TITLE% && echo ======================================== && echo. && powershell -NoProfile -Command ""Get-Content -Path '%ACTIVITY_LOG%' -Wait -Tail 20"""
exit /b 0
