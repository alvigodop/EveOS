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
set "START_SERVER_INSTANCE_BAT=%BAT_DIR%\start-server.instance.bat"
set "START_SERVER_STACK_BAT=%BAT_DIR%\start-server.stack.bat"

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
echo     - One web surface on port %EVEOS_WEB_PORT% + Gemini + bridges. World Book restores its saved On/Off state.
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
call "%START_SERVER_INSTANCE_BAT%" :LaunchEveInstance %*
exit /b %ERRORLEVEL%

:LaunchEvePortOnly
call "%START_SERVER_INSTANCE_BAT%" :LaunchEvePortOnly %*
exit /b %ERRORLEVEL%
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
call "%START_SERVER_STACK_BAT%" :BootStandardStack %*
exit /b %ERRORLEVEL%

:EnsureBridge
call "%START_SERVER_STACK_BAT%" :EnsureBridge %*
exit /b %ERRORLEVEL%

:ReportPort
call "%START_SERVER_STACK_BAT%" :ReportPort %*
exit /b %ERRORLEVEL%

:PortInUse
call "%START_SERVER_STACK_BAT%" :PortInUse %*
exit /b %ERRORLEVEL%
