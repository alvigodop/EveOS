@echo off
setlocal EnableExtensions EnableDelayedExpansion
pushd "%~dp0..\.."

set "PROJECT_ROOT=%CD%"
call "%PROJECT_ROOT%\tools\batch\eveos-ports.bat"
call "%PROJECT_ROOT%\tools\batch\eveos-python.bat"
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python or create the documented .venv.
    pause
    exit /b 1
)
set "BRIDGE_PORT=%CAMOFOX_BRIDGE_PORT%"
if not defined BRIDGE_PORT set "BRIDGE_PORT=3038"
set "SERVER_PORT_START=9377"
set "SERVER_PORT_END=9382"
set "BRIDGE_SCRIPT=%PROJECT_ROOT%\server\bridges\camofox-bridge.py"
set "RUNTIME_ROOT=%PROJECT_ROOT%\tools\camofox-runtime"
set "RUNTIME_PACKAGE=%RUNTIME_ROOT%\package.json"
set "RUNTIME_SERVER=%RUNTIME_ROOT%\node_modules\@askjo\camofox-browser\server.js"
set "BROWSER_ROOT=%RUNTIME_ROOT%\browser"
set "BROWSER_VERSION=%BROWSER_ROOT%\version.json"
set "BROWSER_EXE=%BROWSER_ROOT%\camoufox.exe"
set "STATE_ROOT=%RUNTIME_ROOT%\state"
set "CAMOUFOX_INSTALL_DIR=%BROWSER_ROOT%"
set "EVEOS_CAMOFOX_LOCAL_RUNTIME_ROOT=%STATE_ROOT%"
set "CAMOFOX_PROFILE_DIR=%STATE_ROOT%\profiles"
set "CAMOFOX_COOKIES_DIR=%STATE_ROOT%\cookies"
set "CAMOFOX_TRACES_DIR=%STATE_ROOT%\traces"
set "CAMOFOX_UPLOADS_DIR=%STATE_ROOT%\uploads"
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
    echo [STATUS] Camofox Node runtime: READY
) else (
    echo [STATUS] Camofox Node runtime: MISSING ^(use option 1^)
)
if exist "%BROWSER_VERSION%" (
    if exist "%BROWSER_EXE%" (
        echo [STATUS] Camofox browser: READY ^(EveOS-local^)
        echo          %BROWSER_ROOT%
    ) else (
        echo [STATUS] Camofox browser: INCOMPLETE ^(use option 1^)
    )
) else (
    echo [STATUS] Camofox browser: MISSING ^(use option 1^)
    echo          %BROWSER_ROOT%
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
set "SERVER_PORT_FOUND="
for /L %%P in (%SERVER_PORT_START%,1,%SERVER_PORT_END%) do (
    for /f "tokens=5" %%Q in ('netstat -aon ^| findstr /r /c:":%%P .*LISTENING"') do (
        set "SERVER_PID=%%Q"
        set "SERVER_PORT_FOUND=%%P"
        goto :showStatusServerDone
    )
)
:showStatusServerDone
if defined SERVER_PID (
    echo [STATUS] Upstream camofox-browser server: RUNNING on http://127.0.0.1:!SERVER_PORT_FOUND! ^(PID !SERVER_PID!^)
) else (
    echo [STATUS] Upstream camofox-browser server: STOPPED
)
exit /b 0

:installRuntime
if not exist "%RUNTIME_ROOT%" mkdir "%RUNTIME_ROOT%" >nul 2>nul
if not exist "%RUNTIME_PACKAGE%" (
    echo.
    echo [ERROR] Runtime package manifest not found: %RUNTIME_PACKAGE%
    pause
    exit /b 1
)

echo.
echo [OK] Installing or updating EveOS-local Camofox runtime...
echo [INFO] Browser target: %BROWSER_ROOT%
pushd "%RUNTIME_ROOT%"
call npm install --no-package-lock --omit=dev
if errorlevel 1 (
    echo [ERROR] Camofox npm install failed.
    popd
    pause
    exit /b 1
)

if not exist "%BROWSER_VERSION%" (
    echo [INFO] Fetching Camofox browser into EveOS...
    call npm run fetch-browser
    if errorlevel 1 (
        echo [ERROR] EveOS-local Camofox browser fetch failed.
        popd
        pause
        exit /b 1
    )
)
popd

if not exist "%BROWSER_VERSION%" (
    echo [ERROR] Camofox browser manifest missing: %BROWSER_VERSION%
    pause
    exit /b 1
)
if not exist "%BROWSER_EXE%" (
    echo [ERROR] Camofox browser executable missing: %BROWSER_EXE%
    echo [INFO] Rerun option 1 after inspecting the browser download log.
    pause
    exit /b 1
)
echo [OK] Camofox browser is installed inside EveOS: %BROWSER_ROOT%
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
    echo [ERROR] Camofox runtime is not installed. Run option 1 first.
    pause
    exit /b 1
)
if not exist "%BROWSER_VERSION%" (
    echo.
    echo [ERROR] EveOS-local Camofox browser is missing. Run option 1 first.
    pause
    exit /b 1
)
if not exist "%BROWSER_EXE%" (
    echo.
    echo [ERROR] EveOS-local browser executable is missing. Run option 1 first.
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
start "EveOS Camofox Bridge" "%EVEOS_PYTHON%" -u "%BRIDGE_SCRIPT%" %BRIDGE_PORT%
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
for /L %%P in (%SERVER_PORT_START%,1,%SERVER_PORT_END%) do (
    for /f "tokens=5" %%Q in ('netstat -aon ^| findstr /r /c:":%%P .*LISTENING"') do (
        echo [OK] Stopping upstream Camofox server PID %%Q on port %%P...
        taskkill /F /PID %%Q >nul 2>nul
    )
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
