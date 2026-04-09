@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "SELF_PATH=%~f0"

set "GEMINI_MENU_BAT=%PROJECT_ROOT%\server\server-menu.bat"
set "GEMINI_AUTOSTART_BAT=%PROJECT_ROOT%\server\start-gemini.bat"
set "LIGHTPANDA_CONTROLLER_BAT=%PROJECT_ROOT%\start-lightpanda-bridge.bat"
set "CAMOFOX_CONTROLLER_BAT=%PROJECT_ROOT%\start-camofox-bridge.bat"
set "WIKIMEDIA_CONTROLLER_BAT=%PROJECT_ROOT%\start-wikimedia-bridge.bat"
set "POPUP_CONTROLLER_BAT=%PROJECT_ROOT%\start-popup-bridge.bat"
set "LIGHTPANDA_BRIDGE_PORT=3037"
set "LIGHTPANDA_MONITOR_TITLE=EveOS Lightpanda Monitor"
set "LIGHTPANDA_ACTIVITY_LOG=%PROJECT_ROOT%\bin\lightpanda_activity.log"
set "CAMOFOX_BRIDGE_PORT=3038"
set "CAMOFOX_MONITOR_TITLE=EveOS Camofox Monitor"
set "CAMOFOX_ACTIVITY_LOG=%PROJECT_ROOT%\bin\camofox_activity.log"
set "WIKIMEDIA_BRIDGE_PORT=3039"
set "WIKIMEDIA_MONITOR_TITLE=EveOS Wikimedia Monitor"
set "WIKIMEDIA_ACTIVITY_LOG=%PROJECT_ROOT%\bin\wikimedia_activity.log"
set "POPUP_BRIDGE_PORT=3040"
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
echo [1] Start EveOS instance ^(choose port + data-pack^)
echo     - Port 3000 uses active modular path; other ports default to per-instance packs.
echo [2] Open Gemini Backend Console ^(server\server-menu.bat^)
echo     - Full backend process manager for launcher/main/http Gemini services.
echo [3] Run Gemini auto-start helper ^(server\start-gemini.bat^)
echo     - Compatibility launcher: starts monitor flow via server-menu option 10.
echo [4] Browse and launch any .bat in this EveOS project
echo     - Shows every local project batch script with purpose notes.
echo [5] Browser fallback controls
echo     - Lightpanda, Camofox, and the merged Popup+Wikimedia controller plus monitors.
echo [6] Exit
echo.
set /p "choice=Enter your choice: "

if "%choice%"=="1" (
    call :StartEveServer
    goto :MainMenu
)
if "%choice%"=="2" (
    call :LaunchBatch "%GEMINI_MENU_BAT%"
    goto :MainMenu
)
if "%choice%"=="3" (
    call :LaunchBatch "%GEMINI_AUTOSTART_BAT%"
    goto :MainMenu
)
if "%choice%"=="4" (
    call :BrowseProjectBatchFiles
    goto :MainMenu
)
if "%choice%"=="5" (
    goto :BrowserFallbackMenu
)
if "%choice%"=="6" exit /b 0

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

:ResolveMainDataPackPath
set "MAIN_DATA_PACK=%PROJECT_ROOT%\data\modular-state"
set "SETTINGS_FILE=%PROJECT_ROOT%\data\modular-store-settings.json"
if exist "%SETTINGS_FILE%" (
    for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$p = '%SETTINGS_FILE%'; try { $j = Get-Content -LiteralPath $p -Raw | ConvertFrom-Json; if ($j.activePath) { [Console]::WriteLine($j.activePath) } } catch { }"`) do (
        if not "%%P"=="" set "MAIN_DATA_PACK=%%P"
    )
)
call :ResolveAbsolutePath "%MAIN_DATA_PACK%" MAIN_DATA_PACK
exit /b 0

:LoadLastUsedPackPath
set "LAST_USED_PACK_PATH="
if exist "%LAST_USED_PACK_FILE%" (
    for /f "usebackq delims=" %%P in ("%LAST_USED_PACK_FILE%") do (
        if not "%%P"=="" (
            set "LAST_USED_PACK_PATH=%%P"
            goto :LoadLastUsedPackPathDone
        )
    )
)
:LoadLastUsedPackPathDone
if defined LAST_USED_PACK_PATH call :ResolveAbsolutePath "%LAST_USED_PACK_PATH%" LAST_USED_PACK_PATH
exit /b 0

:PersistLastUsedPackPath
set "SAVE_PACK_PATH=%~1"
if "%SAVE_PACK_PATH%"=="" exit /b 0
if not exist "%PROJECT_ROOT%\data" mkdir "%PROJECT_ROOT%\data" >nul 2>nul
> "%LAST_USED_PACK_FILE%" (
    echo %SAVE_PACK_PATH%
)
exit /b 0

:PromptDataPackPath
setlocal EnableDelayedExpansion
set "DEFAULT_PACK_PATH=%~1"
set "SELECTED_PACK_PATH="

if not defined DEFAULT_PACK_PATH set "DEFAULT_PACK_PATH=%PROJECT_ROOT%\data\modular-state"
call :ResolveAbsolutePath "!DEFAULT_PACK_PATH!" DEFAULT_PACK_PATH
if defined LAST_USED_PACK_PATH call :ResolveAbsolutePath "!LAST_USED_PACK_PATH!" LAST_USED_PACK_PATH

echo.
echo Data-pack selection:
echo   [1] Default path
echo       !DEFAULT_PACK_PATH!
if defined LAST_USED_PACK_PATH (
    echo   [2] Last used path
    echo       !LAST_USED_PACK_PATH!
) else (
    echo   [2] Last used path
    echo       ^(not set yet^)
)
echo   [3] New custom path
echo.
set /p "PACK_PICK=Choose data-pack option (default 1): "
if not defined PACK_PICK set "PACK_PICK=1"

if "!PACK_PICK!"=="1" (
    set "SELECTED_PACK_PATH=!DEFAULT_PACK_PATH!"
    goto :PromptDataPackPathDone
)
if "!PACK_PICK!"=="2" (
    if defined LAST_USED_PACK_PATH (
        set "SELECTED_PACK_PATH=!LAST_USED_PACK_PATH!"
    ) else (
        echo [WARN] No last used path found. Using default.
        set "SELECTED_PACK_PATH=!DEFAULT_PACK_PATH!"
    )
    goto :PromptDataPackPathDone
)
if "!PACK_PICK!"=="3" (
    set "CUSTOM_PACK_PATH="
    set /p "CUSTOM_PACK_PATH=Enter custom data-pack folder path: "
    if not defined CUSTOM_PACK_PATH (
        echo [WARN] Empty custom path. Using default.
        set "SELECTED_PACK_PATH=!DEFAULT_PACK_PATH!"
    ) else (
        call :ResolveAbsolutePath "!CUSTOM_PACK_PATH!" SELECTED_PACK_PATH
    )
    goto :PromptDataPackPathDone
)

echo [WARN] Invalid option. Using default.
set "SELECTED_PACK_PATH=!DEFAULT_PACK_PATH!"

:PromptDataPackPathDone
endlocal & set "%~2=%SELECTED_PACK_PATH%" & exit /b 0

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

start "EveOS Instance %INSTANCE_PORT%" cmd /k "%LP_FLAG%set ""EVEOS_MODULAR_ROOT=%INSTANCE_PACK_PATH%"" && cd /d ""%PROJECT_ROOT%"" && python python-server.py %INSTANCE_PORT%"
call :TrackInstance "%INSTANCE_PORT%" "%INSTANCE_PACK_PATH%" "%INSTANCE_KIND%"
exit /b 0

:LaunchBatch
set "targetBat=%~1"
if not exist "%targetBat%" (
    echo.
    echo [ERROR] Script not found:
    echo         %targetBat%
    echo.
    pause
    exit /b 1
)
echo.
echo [OK] Launching:
echo      %targetBat%
set "targetDir=%~dp1"
set "targetName=%~nx1"
if "%targetDir%"=="" set "targetDir=%PROJECT_ROOT%"
start "EveOS - %targetName%" cmd /k "cd /d ""%targetDir%"" && call ""%targetBat%"""
exit /b 0

:BrowseProjectBatchFiles
call :IndexProjectBatchFiles
if "!BAT_COUNT!"=="0" (
    echo.
    echo [INFO] No additional .bat files found in project.
    echo.
    pause
    exit /b 0
)

echo.
echo Available .bat scripts:
for /L %%I in (1,1,!BAT_COUNT!) do (
    call set "relLabel=%%BAT_LABEL_%%I%%"
    call :GetBatchNote "!relLabel!"
    call echo [%%I] %%BAT_LABEL_%%I%% - !BATCH_NOTE!
)
echo.
echo Enter a number to launch, or press Enter to return.
set /p "pick=Select script: "
if "%pick%"=="" exit /b 0

echo %pick% | findstr /r "^[0-9][0-9]*$" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Invalid number.
    timeout /t 1 /nobreak >nul
    exit /b 1
)

call set "pickedPath=%%BAT_PATH_%pick%%%"
if not defined pickedPath (
    echo [ERROR] Number out of range.
    timeout /t 1 /nobreak >nul
    exit /b 1
)

echo.
call :LaunchBatch "%pickedPath%"
exit /b %ERRORLEVEL%

:IndexProjectBatchFiles
for /f "tokens=1 delims==" %%V in ('set BAT_PATH_ 2^>nul') do set "%%V="
for /f "tokens=1 delims==" %%V in ('set BAT_LABEL_ 2^>nul') do set "%%V="
set "BAT_COUNT=0"

for /R "%PROJECT_ROOT%" %%F in (*.bat) do (
    if /I not "%%~fF"=="%SELF_PATH%" (
        set /a BAT_COUNT+=1
        set "BAT_PATH_!BAT_COUNT!=%%~fF"
        set "relPath=%%~fF"
        set "relPath=!relPath:%PROJECT_ROOT%\=!"
        set "BAT_LABEL_!BAT_COUNT!=!relPath!"
    )
)
exit /b 0

:GetBatchNote
set "BATCH_NOTE=General batch launcher script."
set "rel=%~1"

if /I "%rel%"=="server\server-menu.bat" (
    set "BATCH_NOTE=Gemini backend console (start/stop launcher, main, HTTP, monitor)."
    exit /b 0
)
if /I "%rel%"=="server\start-gemini.bat" (
    set "BATCH_NOTE=Gemini compatibility launcher wrapper (delegates to server-menu)."
    exit /b 0
)
if /I "%rel%"=="start-server.bat" (
    set "BATCH_NOTE=Master EveOS launcher menu (this script)."
    exit /b 0
)
if /I "%rel%"=="start-lightpanda-bridge.bat" (
    set "BATCH_NOTE=Standalone Lightpanda controller for manual start/stop."
    exit /b 0
)
if /I "%rel%"=="start-camofox-bridge.bat" (
    set "BATCH_NOTE=Standalone Camofox controller for manual start/stop."
    exit /b 0
)
if /I "%rel%"=="start-wikimedia-bridge.bat" (
    set "BATCH_NOTE=Legacy Wikimedia-only controller. The Popup bridge now covers Wikimedia fetches too."
    exit /b 0
)
if /I "%rel%"=="start-popup-bridge.bat" (
    set "BATCH_NOTE=Standalone Popup+Wikimedia bridge controller for in-site popups and compliant Wikipedia fetches."
    exit /b 0
)
set "BATCH_NOTE=Project-specific batch script."
exit /b 0

:NormalizePortInput
setlocal EnableDelayedExpansion
set "raw=%~1"
set "defaultPort=%~2"

for /f "tokens=* delims= " %%A in ("!raw!") do set "raw=%%~A"
if not defined raw set "raw=!defaultPort!"

set "bad="
for /f "delims=0123456789" %%A in ("!raw!") do set "bad=%%A"
if defined bad (
    endlocal
    exit /b 1
)

set /a portValue=!raw!+0 >nul 2>&1
if errorlevel 1 (
    endlocal
    exit /b 1
)

if !portValue! LSS 1 (
    endlocal
    exit /b 1
)
if !portValue! GTR 65535 (
    endlocal
    exit /b 1
)

endlocal & set "%~3=%raw%" & exit /b 0

:ResolveAbsolutePath
setlocal EnableDelayedExpansion
set "raw=%~1"
set "resolved="

if not defined raw (
    set "resolved=%PROJECT_ROOT%"
) else (
    if /I "!raw:~0,2!"=="\\" (
        set "resolved=!raw!"
    ) else (
        if /I "!raw:~1,1!"==":" (
            set "resolved=!raw!"
        ) else (
            set "resolved=%PROJECT_ROOT%\!raw!"
        )
    )
)

endlocal & set "%~2=%resolved%" & exit /b 0

:TrackInstance
set "trackPort=%~1"
set "trackPath=%~2"
set "trackKind=%~3"
set "newPortList="
for %%P in (%ACTIVE_INSTANCE_PORTS%) do (
    if /I not "%%P"=="%trackPort%" set "newPortList=!newPortList! %%P"
)
set "ACTIVE_INSTANCE_PORTS=%trackPort% %newPortList%"
for /f "tokens=1,2,3,4,5" %%A in ("%ACTIVE_INSTANCE_PORTS%") do set "ACTIVE_INSTANCE_PORTS=%%A %%B %%C %%D %%E"
set "INSTANCE_DATA_%trackPort%=%trackPath%"
set "INSTANCE_KIND_%trackPort%=%trackKind%"
set "LAST_USED_PACK_PATH=%trackPath%"
call :PersistLastUsedPackPath "%trackPath%"
exit /b 0

:ShowTrackedInstances
echo Tracked data-packs in this launcher session ^(up to 5^):
if "%ACTIVE_INSTANCE_PORTS%"=="" (
    echo   - none yet
    exit /b 0
)

for %%P in (%ACTIVE_INSTANCE_PORTS%) do (
    call set "entryPath=%%INSTANCE_DATA_%%P%%"
    call set "entryKind=%%INSTANCE_KIND_%%P%%"
    if defined entryPath (
        echo   - Port %%P ^| !entryKind! ^| !entryPath!
    )
)
exit /b 0

:RefreshBrowserFallbackStatus
set "LP_READY="
if exist "%PROJECT_ROOT%\bin\lightpanda" (
    set "LP_READY=1"
)
call :CheckStandaloneLightpanda
call :CheckCamofoxRuntime
call :CheckStandaloneCamofox
call :CheckStandaloneWikimedia
call :CheckStandalonePopup
exit /b 0

:RefreshLightpandaStatus
call :RefreshBrowserFallbackStatus
exit /b 0

:CheckStandaloneLightpanda
set "LP_STANDALONE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%LIGHTPANDA_BRIDGE_PORT% .*LISTENING"') do (
    set "LP_STANDALONE_PID=%%P"
    goto :CheckStandaloneLightpandaDone
)
:CheckStandaloneLightpandaDone
exit /b 0

:CheckCamofoxRuntime
set "CF_READY="
if exist "%CAMOFOX_RUNTIME_SERVER%" (
    set "CF_READY=1"
)
exit /b 0

:CheckStandaloneCamofox
set "CF_STANDALONE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%CAMOFOX_BRIDGE_PORT% .*LISTENING"') do (
    set "CF_STANDALONE_PID=%%P"
    goto :CheckStandaloneCamofoxDone
)
:CheckStandaloneCamofoxDone
exit /b 0

:CheckStandaloneWikimedia
set "WMF_STANDALONE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%WIKIMEDIA_BRIDGE_PORT% .*LISTENING"') do (
    set "WMF_STANDALONE_PID=%%P"
    goto :CheckStandaloneWikimediaDone
)
:CheckStandaloneWikimediaDone
exit /b 0

:CheckStandalonePopup
set "POPUP_STANDALONE_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%POPUP_BRIDGE_PORT% .*LISTENING"') do (
    set "POPUP_STANDALONE_PID=%%P"
    goto :CheckStandalonePopupDone
)
:CheckStandalonePopupDone
exit /b 0

:EnsureLightpandaMonitor
if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%LIGHTPANDA_ACTIVITY_LOG%" type nul > "%LIGHTPANDA_ACTIVITY_LOG%"
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"%LIGHTPANDA_MONITOR_TITLE%" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
start "%LIGHTPANDA_MONITOR_TITLE%" cmd /k "echo ======================================== && echo   %LIGHTPANDA_MONITOR_TITLE% && echo ======================================== && echo. && powershell -NoProfile -Command ""Get-Content -Path '%LIGHTPANDA_ACTIVITY_LOG%' -Wait -Tail 20"""
exit /b 0

:EnsureCamofoxMonitor
if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%CAMOFOX_ACTIVITY_LOG%" type nul > "%CAMOFOX_ACTIVITY_LOG%"
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"%CAMOFOX_MONITOR_TITLE%" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
start "%CAMOFOX_MONITOR_TITLE%" cmd /k "echo ======================================== && echo   %CAMOFOX_MONITOR_TITLE% && echo ======================================== && echo. && powershell -NoProfile -Command ""Get-Content -Path '%CAMOFOX_ACTIVITY_LOG%' -Wait -Tail 20"""
exit /b 0

:EnsureWikimediaMonitor
if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%WIKIMEDIA_ACTIVITY_LOG%" type nul > "%WIKIMEDIA_ACTIVITY_LOG%"
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"%WIKIMEDIA_MONITOR_TITLE%" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
start "%WIKIMEDIA_MONITOR_TITLE%" cmd /k "echo ======================================== && echo   %WIKIMEDIA_MONITOR_TITLE% && echo ======================================== && echo. && powershell -NoProfile -Command ""Get-Content -Path '%WIKIMEDIA_ACTIVITY_LOG%' -Wait -Tail 20"""
exit /b 0

:EnsurePopupMonitor
if not exist "%PROJECT_ROOT%\bin" mkdir "%PROJECT_ROOT%\bin" >nul 2>nul
if not exist "%POPUP_ACTIVITY_LOG%" type nul > "%POPUP_ACTIVITY_LOG%"
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"%POPUP_MONITOR_TITLE%" >nul
if %ERRORLEVEL% EQU 0 exit /b 0
start "%POPUP_MONITOR_TITLE%" cmd /k "echo ======================================== && echo   %POPUP_MONITOR_TITLE% && echo ======================================== && echo. && powershell -NoProfile -Command ""Get-Content -Path '%POPUP_ACTIVITY_LOG%' -Wait -Tail 20"""
exit /b 0
