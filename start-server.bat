@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "SELF_PATH=%~f0"

set "GEMINI_MENU_BAT=%PROJECT_ROOT%\server\server-menu.bat"
set "GEMINI_AUTOSTART_BAT=%PROJECT_ROOT%\server\start-gemini.bat"
set "MAIN_DATA_PACK=%PROJECT_ROOT%\data\modular-state"
set "ACTIVE_INSTANCE_PORTS="

:MainMenu
cls
echo ========================================
echo   EveOS Startup Launcher
echo ========================================
echo.
call :ShowTrackedInstances
echo.
echo [1] Start EveOS instance ^(choose port + data-pack^)
echo     - Port 3000 uses active modular path; other ports default to per-instance packs.
echo [2] Open Gemini Backend Console ^(server\server-menu.bat^)
echo     - Full backend process manager for launcher/main/http Gemini services.
echo [3] Run Gemini auto-start helper ^(server\start-gemini.bat^)
echo     - Compatibility launcher: starts monitor flow via server-menu option 10.
echo [4] Browse and launch any .bat in this EveOS project
echo     - Shows every local project batch script with purpose notes.
echo [5] Exit
echo.
set /p "choice=Enter your choice (1-5): "

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
if "%choice%"=="5" exit /b 0

echo.
echo [ERROR] Invalid option.
timeout /t 1 /nobreak >nul
goto :MainMenu

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
set /p "INSTANCE_PACK_PATH=Data-pack folder path (default %DEFAULT_PACK_PATH%): "
if "%INSTANCE_PACK_PATH%"=="" set "INSTANCE_PACK_PATH=%DEFAULT_PACK_PATH%"

call :ResolveAbsolutePath "%INSTANCE_PACK_PATH%" INSTANCE_PACK_PATH

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
start "EveOS Instance %INSTANCE_PORT%" cmd /k "cd /d ""%PROJECT_ROOT%"" && python python-server.py %INSTANCE_PORT% --modular-root ""%INSTANCE_PACK_PATH%"""
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
