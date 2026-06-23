@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "SELF_PATH=%~f0"
rem --- All sub-bats now live in tools\batch\ (only this launcher stays in the project root) ---
set "BAT_DIR=%PROJECT_ROOT%\tools\batch"
set "START_SERVER_BROWSE_BAT=%BAT_DIR%\start-server.browse.bat"
set "START_SERVER_PATHS_BAT=%BAT_DIR%\start-server.paths.bat"
set "START_SERVER_BROWSER_BAT=%BAT_DIR%\start-server.browser.bat"

set "GEMINI_MENU_BAT=%BAT_DIR%\server-menu.bat"
set "GEMINI_AUTOSTART_BAT=%BAT_DIR%\start-gemini.bat"
set "LIGHTPANDA_CONTROLLER_BAT=%BAT_DIR%\start-lightpanda-bridge.bat"
set "CAMOFOX_CONTROLLER_BAT=%BAT_DIR%\start-camofox-bridge.bat"
set "WIKIMEDIA_CONTROLLER_BAT=%BAT_DIR%\start-wikimedia-bridge.bat"
set "POPUP_CONTROLLER_BAT=%BAT_DIR%\start-popup-bridge.bat"
rem --- Canonical port definitions (single source of truth) ---
call "%BAT_DIR%\eveos-ports.bat"
if not defined LIGHTPANDA_BRIDGE_PORT set "LIGHTPANDA_BRIDGE_PORT=3037"
if not defined CAMOFOX_BRIDGE_PORT set "CAMOFOX_BRIDGE_PORT=3038"
if not defined WIKIMEDIA_BRIDGE_PORT set "WIKIMEDIA_BRIDGE_PORT=3039"
if not defined POPUP_BRIDGE_PORT set "POPUP_BRIDGE_PORT=3040"
if not defined EVEOS_WEB_PORT set "EVEOS_WEB_PORT=8765"
set "LIGHTPANDA_MONITOR_TITLE=EveOS Lightpanda Monitor"
set "LIGHTPANDA_ACTIVITY_LOG=%PROJECT_ROOT%\bin\lightpanda_activity.log"
set "CAMOFOX_MONITOR_TITLE=EveOS Camofox Monitor"
set "CAMOFOX_ACTIVITY_LOG=%PROJECT_ROOT%\bin\camofox_activity.log"
set "WIKIMEDIA_MONITOR_TITLE=EveOS Wikimedia Monitor"
set "WIKIMEDIA_ACTIVITY_LOG=%PROJECT_ROOT%\bin\wikimedia_activity.log"
set "POPUP_MONITOR_TITLE=EveOS Popup Bridge Monitor"
set "POPUP_ACTIVITY_LOG=%PROJECT_ROOT%\bin\popup_activity.log"
set "CAMOFOX_RUNTIME_SERVER=%PROJECT_ROOT%\tools\camofox-runtime\node_modules\@askjo\camofox-browser\server.js"
set "MAIN_DATA_PACK=%PROJECT_ROOT%\data\modular-state"
set "LAST_USED_PACK_FILE=%PROJECT_ROOT%\data\launcher-last-pack.txt"
set "LAST_USED_PACK_PATH="
set "ACTIVE_INSTANCE_PORTS="
call :LoadLastUsedPackPath
set "LP_READY="
if exist "%PROJECT_ROOT%\bin\lightpanda" (
    set "LP_READY=1"
)
set "LP_ENABLED_STATE=1"

rem --- Non-interactive boot: "start-server.bat boot" (also the target of the tools\batch\boot-eveos.bat shim) ---
if /I "%~1"=="boot" (
    call :BootStandardStack
    exit /b %ERRORLEVEL%
)

:MainMenu
cls
call :RefreshBrowserFallbackStatus
echo ========================================
echo   EveOS Startup Launcher
echo ========================================
echo.
call :ShowTrackedInstances
echo.
if defined LP_READY (
    echo   [STATUS] Lightpanda binary: READY
) else (
    echo   [STATUS] Lightpanda binary: NOT FOUND ^(standard proxies only^)
)
if "%LP_ENABLED_STATE%"=="1" (
    echo   [STATUS] Integrated bridge for new EveOS instances: ENABLED
) else (
    echo   [STATUS] Integrated bridge for new EveOS instances: DISABLED
)
if defined LP_STANDALONE_PID (
    echo   [STATUS] Standalone bridge: RUNNING on http://127.0.0.1:%LIGHTPANDA_BRIDGE_PORT% ^(PID %LP_STANDALONE_PID%^)
) else (
    echo   [STATUS] Standalone bridge: STOPPED
)
if defined CF_READY (
    echo   [STATUS] Camofox runtime: READY
) else (
    echo   [STATUS] Camofox runtime: NOT INSTALLED
)
if defined CF_STANDALONE_PID (
    echo   [STATUS] Camofox bridge: RUNNING on http://127.0.0.1:%CAMOFOX_BRIDGE_PORT% ^(PID %CF_STANDALONE_PID%^)
) else (
    echo   [STATUS] Camofox bridge: STOPPED
)
if defined WMF_STANDALONE_PID (
    echo   [STATUS] Wikimedia bridge: RUNNING on http://127.0.0.1:%WIKIMEDIA_BRIDGE_PORT% ^(PID %WMF_STANDALONE_PID%^)
) else (
    echo   [STATUS] Wikimedia bridge: STOPPED
)
if defined POPUP_STANDALONE_PID (
    echo   [STATUS] Popup bridge: RUNNING on http://127.0.0.1:%POPUP_BRIDGE_PORT% ^(PID %POPUP_STANDALONE_PID%^)
) else (
    echo   [STATUS] Popup bridge: STOPPED
)
echo.
echo [S] Start STANDARD EveOS stack  ^(recommended canonical boot^)
echo     - One web surface on port %EVEOS_WEB_PORT% + Gemini backend + bridges. Guarded, no redundant port-states.
echo.
echo --- Advanced / explicit (use when you specifically want a different port or sequence) ---
echo [1] Start EveOS instance ^(choose port + data-pack^)
echo     - Advanced: port 3000 uses active modular path; other ports default to per-instance packs.
echo [2] Start EveOS port only ^(no data-pack prompt^)
echo     - Advanced: serves EveOS at a chosen port using the current active data-pack.
echo [3] Open Gemini Backend Console ^(tools\batch\server-menu.bat^)
echo     - Start/stop the canonical Gemini Live backend ^(9083 WebSocket + 9084 status^).
echo [4] Run Gemini auto-start helper ^(tools\batch\start-gemini.bat^)
echo     - Starts the file:// control helper, then starts the Gemini backend.
echo [5] Browse and launch any .bat in this EveOS project
echo     - Shows every local project batch script with purpose notes.
echo [6] Browser fallback controls
echo     - Lightpanda, Camofox, and the merged Popup+Wikimedia controller plus monitors.
echo [7] Exit
echo.
set /p "choice=Enter your choice: "

if /I "%choice%"=="S" (
    call :BootStandardStack
    pause
    goto :MainMenu
)
if "%choice%"=="1" (
    call :StartEveServer
    goto :MainMenu
)
if "%choice%"=="2" (
    call :StartEvePortOnly
    goto :MainMenu
)
if "%choice%"=="3" (
    call :LaunchBatch "%GEMINI_MENU_BAT%"
    goto :MainMenu
)
if "%choice%"=="4" (
    call :LaunchBatch "%GEMINI_AUTOSTART_BAT%"
    goto :MainMenu
)
if "%choice%"=="5" (
    call :BrowseProjectBatchFiles
    goto :MainMenu
)
if "%choice%"=="6" (
    goto :BrowserFallbackMenu
)
if "%choice%"=="7" exit /b 0

echo.
echo [ERROR] Invalid option.
timeout /t 1 /nobreak >nul
goto :MainMenu

:BrowserFallbackMenu
cls
call :RefreshBrowserFallbackStatus
echo ========================================
echo   Browser Fallback Controls
echo ========================================
echo.
if defined LP_READY (
    echo   [STATUS] Lightpanda binary: READY
) else (
    echo   [STATUS] Lightpanda binary: NOT FOUND
)
if "%LP_ENABLED_STATE%"=="1" (
    echo   [STATUS] Integrated bridge for new EveOS instances: ENABLED
) else (
    echo   [STATUS] Integrated bridge for new EveOS instances: DISABLED
)
if defined LP_STANDALONE_PID (
    echo   [STATUS] Standalone bridge: RUNNING on http://127.0.0.1:%LIGHTPANDA_BRIDGE_PORT% ^(PID %LP_STANDALONE_PID%^)
) else (
    echo   [STATUS] Standalone bridge: STOPPED
)
if defined CF_READY (
    echo   [STATUS] Camofox runtime: READY
) else (
    echo   [STATUS] Camofox runtime: NOT INSTALLED
)
if defined CF_STANDALONE_PID (
    echo   [STATUS] Camofox bridge: RUNNING on http://127.0.0.1:%CAMOFOX_BRIDGE_PORT% ^(PID %CF_STANDALONE_PID%^)
) else (
    echo   [STATUS] Camofox bridge: STOPPED
)
if defined WMF_STANDALONE_PID (
    echo   [STATUS] Wikimedia bridge: RUNNING on http://127.0.0.1:%WIKIMEDIA_BRIDGE_PORT% ^(PID %WMF_STANDALONE_PID%^)
) else (
    echo   [STATUS] Wikimedia bridge: STOPPED
)
if defined POPUP_STANDALONE_PID (
    echo   [STATUS] Popup bridge: RUNNING on http://127.0.0.1:%POPUP_BRIDGE_PORT% ^(PID %POPUP_STANDALONE_PID%^)
) else (
    echo   [STATUS] Popup bridge: STOPPED
)
echo.
echo   Auto-Title ^> Use Lightpanda checks the standalone bridge first.
echo   If Lightpanda still fails, normal autotitle can escalate to Camofox.
echo   Wikimedia ^> The Popup bridge now also handles compliant Wikipedia/Wikimedia requests from file://.
echo   Popup UI ^> Use the Popup bridge for Search Unidex, Social Manager, bookmark internal view, and Wikimedia transport.
echo.
echo [1] Open standalone Lightpanda controller
echo [2] Open standalone Camofox controller
echo [3] Open standalone Wikimedia controller ^(legacy, optional^)
echo [4] Open standalone Popup + Wikimedia bridge controller
echo [5] Toggle integrated Lightpanda bridge for new EveOS instances
echo [6] Open shared Lightpanda activity monitor
echo [7] Open shared Camofox activity monitor
echo [8] Open shared Wikimedia activity monitor
echo [9] Open shared Popup bridge activity monitor
echo [0] Return
echo.
set /p "lpchoice=Enter your choice: "

if "%lpchoice%"=="1" (
    call :LaunchBatch "%LIGHTPANDA_CONTROLLER_BAT%"
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="2" (
    call :LaunchBatch "%CAMOFOX_CONTROLLER_BAT%"
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="3" (
    call :LaunchBatch "%WIKIMEDIA_CONTROLLER_BAT%"
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="4" (
    call :LaunchBatch "%POPUP_CONTROLLER_BAT%"
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="5" (
    if "%LP_ENABLED_STATE%"=="1" (
        set "LP_ENABLED_STATE=0"
    ) else (
        set "LP_ENABLED_STATE=1"
    )
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="6" (
    call :EnsureLightpandaMonitor
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="7" (
    call :EnsureCamofoxMonitor
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="8" (
    call :EnsureWikimediaMonitor
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="9" (
    call :EnsurePopupMonitor
    goto :BrowserFallbackMenu
)
if "%lpchoice%"=="0" goto :MainMenu

echo.
echo [ERROR] Invalid option.
timeout /t 1 /nobreak >nul
goto :BrowserFallbackMenu

:StartEveServer
echo.
echo ========================================
echo   Start EveOS Instance
echo ========================================
echo.
set "INSTANCE_PORT_INPUT="
set /p "INSTANCE_PORT_INPUT=Port (default 3000): "
call :NormalizePortInput "%INSTANCE_PORT_INPUT%" "3000" INSTANCE_PORT
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Port must be a numeric value between 1 and 65535.
    goto :StartEveServer
)

if "%INSTANCE_PORT%"=="3000" (
    call :ResolveMainDataPackPath
    set "DEFAULT_PACK_PATH=%MAIN_DATA_PACK%"
    set "INSTANCE_KIND=Main"
    set "PORT_MODE=replace"
) else (
    set "DEFAULT_PACK_PATH=%PROJECT_ROOT%\data\modular-packs\instance-%INSTANCE_PORT%"
    set "INSTANCE_KIND=Additional"
    set "PORT_MODE=strict"
)

set "INSTANCE_PACK_PATH="
call :PromptDataPackPath "%DEFAULT_PACK_PATH%" INSTANCE_PACK_PATH

call :LaunchEveInstance "%INSTANCE_PORT%" "%INSTANCE_PACK_PATH%" "%INSTANCE_KIND%" "%PORT_MODE%"
exit /b %ERRORLEVEL%

:StartEvePortOnly
echo.
echo ========================================
echo   Start EveOS Port Only
echo ========================================
echo.
echo This serves EveOS without changing or prompting for a data-pack.
echo Use this for local preview URLs like http://127.0.0.1:8765/EveOS.html.
echo.
set "INSTANCE_PORT_INPUT="
set /p "INSTANCE_PORT_INPUT=Port (default 8765): "
call :NormalizePortInput "%INSTANCE_PORT_INPUT%" "8765" INSTANCE_PORT
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Port must be a numeric value between 1 and 65535.
    goto :StartEvePortOnly
)

call :LaunchEvePortOnly "%INSTANCE_PORT%"
exit /b %ERRORLEVEL%

:ResolveMainDataPackPath
call "%START_SERVER_PATHS_BAT%" :ResolveMainDataPackPath
exit /b %ERRORLEVEL%

:LoadLastUsedPackPath
call "%START_SERVER_PATHS_BAT%" :LoadLastUsedPackPath
exit /b %ERRORLEVEL%

:PersistLastUsedPackPath
call "%START_SERVER_PATHS_BAT%" :PersistLastUsedPackPath %*
exit /b %ERRORLEVEL%

:PromptDataPackPath
call "%START_SERVER_PATHS_BAT%" :PromptDataPackPath %*
exit /b %ERRORLEVEL%

:LaunchEveInstance
set "INSTANCE_PORT=%~1"
set "INSTANCE_PACK_PATH=%~2"
set "INSTANCE_KIND=%~3"
set "PORT_MODE=%~4"

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Install Python from https://www.python.org/downloads/
    echo Make sure "Add Python to PATH" is enabled.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Python found:
python --version
echo.

if not exist "%INSTANCE_PACK_PATH%" mkdir "%INSTANCE_PACK_PATH%" >nul 2>nul

netstat -ano | findstr ":%INSTANCE_PORT%" | find "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    if /I "%PORT_MODE%"=="replace" (
        echo [INFO] Port %INSTANCE_PORT% is in use. Stopping listeners on that port...
        for /f "tokens=5" %%a in ('netstat -aon ^| find ":%INSTANCE_PORT%" ^| find "LISTENING"') do (
            if "%%a" NEQ "0" (
                echo Killing PID %%a...
                taskkill /f /pid %%a >nul 2>nul
            )
        )
        timeout /t 2 /nobreak >nul
    ) else (
        echo [ERROR] Port %INSTANCE_PORT% is already in use. Pick another port.
        timeout /t 1 /nobreak >nul
        exit /b 1
    )
)

echo [OK] Launching %INSTANCE_KIND% EveOS instance in a new window:
echo      Port: %INSTANCE_PORT%
echo      Data: %INSTANCE_PACK_PATH%
set "LP_FLAG="
if "%LP_ENABLED_STATE%"=="0" (
    set "LP_FLAG=set ""EVEOS_LIGHTPANDA_DISABLED=1"" && "
) else (
    call :EnsureLightpandaMonitor
)

start "EveOS Instance %INSTANCE_PORT%" cmd /k "%LP_FLAG%set ""EVEOS_MODULAR_ROOT=%INSTANCE_PACK_PATH%"" && cd /d ""%PROJECT_ROOT%"" && python server/python-server.py %INSTANCE_PORT%"
call :TrackInstance "%INSTANCE_PORT%" "%INSTANCE_PACK_PATH%" "%INSTANCE_KIND%"
exit /b 0

:LaunchEvePortOnly
set "INSTANCE_PORT=%~1"

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Install Python from https://www.python.org/downloads/
    echo Make sure "Add Python to PATH" is enabled.
    echo.
    pause
    exit /b 1
)

netstat -ano | findstr ":%INSTANCE_PORT%" | find "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [ERROR] Port %INSTANCE_PORT% is already in use. Pick another port.
    timeout /t 1 /nobreak >nul
    exit /b 1
)

echo.
echo [OK] Launching EveOS HTTP port in a new window:
echo      URL: http://127.0.0.1:%INSTANCE_PORT%/EveOS.html
echo      Data: current active modular data-pack
echo.

start "EveOS Port %INSTANCE_PORT%" cmd /k "cd /d ""%PROJECT_ROOT%"" && python server/python-server.py %INSTANCE_PORT%"
call :TrackInstance "%INSTANCE_PORT%" "active modular data-pack" "PortOnly"
exit /b 0

:LaunchBatch
call "%START_SERVER_BROWSE_BAT%" :LaunchBatch %*
exit /b %ERRORLEVEL%

:BrowseProjectBatchFiles
call "%START_SERVER_BROWSE_BAT%" :BrowseProjectBatchFiles
exit /b %ERRORLEVEL%

:IndexProjectBatchFiles
call "%START_SERVER_BROWSE_BAT%" :IndexProjectBatchFiles
exit /b %ERRORLEVEL%

:GetBatchNote
call "%START_SERVER_BROWSE_BAT%" :GetBatchNote %*
exit /b %ERRORLEVEL%

:NormalizePortInput
call "%START_SERVER_PATHS_BAT%" :NormalizePortInput %*
exit /b %ERRORLEVEL%

:ResolveAbsolutePath
call "%START_SERVER_PATHS_BAT%" :ResolveAbsolutePath %*
exit /b %ERRORLEVEL%

:TrackInstance
call "%START_SERVER_PATHS_BAT%" :TrackInstance %*
exit /b %ERRORLEVEL%

:ShowTrackedInstances
call "%START_SERVER_PATHS_BAT%" :ShowTrackedInstances
exit /b %ERRORLEVEL%

:RefreshBrowserFallbackStatus
call "%START_SERVER_BROWSER_BAT%" :RefreshBrowserFallbackStatus
exit /b %ERRORLEVEL%

:RefreshLightpandaStatus
call "%START_SERVER_BROWSER_BAT%" :RefreshLightpandaStatus
exit /b %ERRORLEVEL%

:CheckStandaloneLightpanda
call "%START_SERVER_BROWSER_BAT%" :CheckStandaloneLightpanda
exit /b %ERRORLEVEL%

:CheckCamofoxRuntime
call "%START_SERVER_BROWSER_BAT%" :CheckCamofoxRuntime
exit /b %ERRORLEVEL%

:CheckStandaloneCamofox
call "%START_SERVER_BROWSER_BAT%" :CheckStandaloneCamofox
exit /b %ERRORLEVEL%

:CheckStandaloneWikimedia
call "%START_SERVER_BROWSER_BAT%" :CheckStandaloneWikimedia
exit /b %ERRORLEVEL%

:CheckStandalonePopup
call "%START_SERVER_BROWSER_BAT%" :CheckStandalonePopup
exit /b %ERRORLEVEL%

:EnsureLightpandaMonitor
call "%START_SERVER_BROWSER_BAT%" :EnsureLightpandaMonitor
exit /b %ERRORLEVEL%

:EnsureCamofoxMonitor
call "%START_SERVER_BROWSER_BAT%" :EnsureCamofoxMonitor
exit /b %ERRORLEVEL%

:EnsureWikimediaMonitor
call "%START_SERVER_BROWSER_BAT%" :EnsureWikimediaMonitor
exit /b %ERRORLEVEL%

:EnsurePopupMonitor
call "%START_SERVER_BROWSER_BAT%" :EnsurePopupMonitor
exit /b %ERRORLEVEL%

rem ============================================================
rem  Canonical full EveOS stack (formerly boot-eveos.bat): the
rem  standard "go-to" boot. ONE web surface (which hosts the
rem  soundboard, VB-Cable bypass audio AND the global hotkeys) +
rem  the Gemini backend + the bridges, each guarded so nothing
rem  double-launches. Reached via menu [S] or "start-server.bat boot".
rem ============================================================
:BootStandardStack
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Install from https://www.python.org/downloads/ ^(enable "Add to PATH"^).
    pause
    exit /b 1
)
echo.
echo ========================================
echo   EveOS Canonical Boot
echo ========================================
echo   Web + hotkeys + audio bypass: http://127.0.0.1:%EVEOS_WEB_PORT%/EveOS.html
echo.
rem --- 1. EveOS web (guarded). Hosts the soundboard, VB-Cable bypass and global hotkeys. ---
call :PortInUse "%EVEOS_WEB_PORT%" _WEB_PID
if defined _WEB_PID (
    echo [OK]    EveOS web already running on port %EVEOS_WEB_PORT% ^(PID !_WEB_PID!^).
) else (
    echo [START] EveOS web ^(hotkeys + audio bypass^) on port %EVEOS_WEB_PORT%...
    start "EveOS %EVEOS_WEB_PORT%" cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""PYTHONUNBUFFERED=1"" && python -u server/python-server.py %EVEOS_WEB_PORT%"
)
rem --- 2. Gemini backend + file-mode control helper (start-gemini guards internally) ---
echo [BOOT]  Ensuring Gemini backend ^(WS %GEMINI_WS_PORT% / status %GEMINI_STATUS_PORT%^)...
call "%GEMINI_AUTOSTART_BAT%" >nul 2>nul
call :ReportPort "Gemini WebSocket" "%GEMINI_WS_PORT%"
call :ReportPort "Gemini control  " "%GEMINI_CONTROL_PORT%"
rem --- 3. Popup bridge (file:// popups + Wikimedia transport) ---
call :EnsureBridge "Popup bridge   " "%POPUP_BRIDGE_PORT%" "server\bridges\popup-bridge.py"
rem --- 4. Lightpanda bridge (only if the binary is present) ---
if exist "%PROJECT_ROOT%\bin\lightpanda" (
    call :EnsureBridge "Lightpanda     " "%LIGHTPANDA_BRIDGE_PORT%" "server\bridges\lightpanda-bridge.py"
) else (
    echo [SKIP]  Lightpanda bridge - binary not found ^(bin\lightpanda^).
)
rem --- 5. Camofox bridge (only if the runtime is installed) ---
if exist "%CAMOFOX_RUNTIME_SERVER%" (
    call :EnsureBridge "Camofox        " "%CAMOFOX_BRIDGE_PORT%" "server\bridges\camofox-bridge.py"
) else (
    echo [SKIP]  Camofox bridge - runtime not installed.
)
echo.
echo ========================================
echo   Boot complete. Open: http://127.0.0.1:%EVEOS_WEB_PORT%/EveOS.html
echo ========================================
exit /b 0

:EnsureBridge
rem %1=label  %2=port  %3=relative script path
set "_LABEL=%~1"
set "_PORT=%~2"
set "_SCRIPT=%PROJECT_ROOT%\%~3"
if not exist "%_SCRIPT%" (
    echo [SKIP]  %_LABEL% - script not found: %_SCRIPT%
    exit /b 0
)
call :PortInUse "%_PORT%" _BPID
if defined _BPID (
    echo [OK]    %_LABEL% already running on port %_PORT% ^(PID !_BPID!^).
    exit /b 0
)
echo [START] %_LABEL% on port %_PORT%...
start "EveOS %_LABEL%" cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""EVEOS_PROJECT_ROOT=%PROJECT_ROOT%"" && set ""PYTHONUNBUFFERED=1"" && python -u ""%_SCRIPT%"" %_PORT%"
exit /b 0

:ReportPort
set "_LABEL=%~1"
call :PortInUse "%~2" _RPID
if defined _RPID (
    echo [OK]    %_LABEL% running on port %~2 ^(PID !_RPID!^).
) else (
    echo [WARN]  %_LABEL% not detected on port %~2 yet ^(may still be starting^).
)
exit /b 0

:PortInUse
rem %1=port  %2=name of output var (set to listening PID, else empty).
set "%~2="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%~1 .*LISTENING"') do (
    set "%~2=%%P"
    goto :PortInUseDone
)
:PortInUseDone
exit /b 0
