@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0..\.."

set "PROJECT_ROOT=%CD%"
call "%PROJECT_ROOT%\tools\windows\eveos-ports.bat"
set "BRIDGE_PORT=%POPUP_BRIDGE_PORT%"
if not defined BRIDGE_PORT set "BRIDGE_PORT=3040"
set "BRIDGE_SCRIPT=%PROJECT_ROOT%\server\bridges\popup-bridge.py"
set "ACTIVITY_LOG=%PROJECT_ROOT%\bin\popup_activity.log"
set "MONITOR_TITLE=EveOS Popup Bridge Monitor"

:menu
cls
echo ========================================
echo   Popup + Wikimedia Standalone Controller
echo ========================================
echo.
call :showStatus
echo.
echo [1] Start popup bridge
echo [2] Stop popup bridge
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
if exist "%BRIDGE_SCRIPT%" (
    echo [STATUS] Bridge script: READY
    echo          %BRIDGE_SCRIPT%
) else (
    echo [STATUS] Bridge script: NOT FOUND
    echo          Expected: %BRIDGE_SCRIPT%
)

set "BRIDGE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%BRIDGE_PORT% .*LISTENING"') do (
    set "BRIDGE_PID=%%P"
    goto :showStatusPortDone
)
:showStatusPortDone
if defined BRIDGE_PID (
    echo [STATUS] Bridge: RUNNING on http://127.0.0.1:%BRIDGE_PORT% ^(PID !BRIDGE_PID!^)
    echo          Use this for in-site popups plus Wikimedia/Wikipedia transport from file://
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

for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%BRIDGE_PORT% .*LISTENING"') do (
    echo.
    echo [INFO] Bridge already running on port %BRIDGE_PORT% ^(PID %%P^).
    timeout /t 1 /nobreak >nul
    exit /b 0
)

if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%ACTIVITY_LOG%" type nul > "%ACTIVITY_LOG%"

echo.
echo [OK] Starting popup + Wikimedia bridge on port %BRIDGE_PORT%...
start "EveOS Popup Bridge" cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""EVEOS_PROJECT_ROOT=%PROJECT_ROOT%"" && python ""%BRIDGE_SCRIPT%"" %BRIDGE_PORT%"
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
