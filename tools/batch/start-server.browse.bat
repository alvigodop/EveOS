@echo off
if not defined PROJECT_ROOT (
    for %%R in ("%~dp0..\..") do set "PROJECT_ROOT=%%~fR"
)
if not defined SELF_PATH set "SELF_PATH=%~f0"
if "%~1"=="" exit /b 0
set "_START_SERVER_BROWSE_LABEL=%~1"
shift
goto %_START_SERVER_BROWSE_LABEL%

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

if /I "%rel%"=="tools\batch\server-menu.bat" (
    set "BATCH_NOTE=Gemini backend console (start/stop WebSocket plus status server)."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-gemini.bat" (
    set "BATCH_NOTE=Quick launcher: starts the canonical Gemini backend."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-gemini-control.bat" (
    set "BATCH_NOTE=File-mode helper: lets file:// EveOS start/stop Gemini without an EveOS HTTP port."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-eveos-port.bat" (
    set "BATCH_NOTE=Starts EveOS on a chosen HTTP port without prompting for a data-pack."
    exit /b 0
)
if /I "%rel%"=="start-server.bat" (
    set "BATCH_NOTE=Master EveOS launcher menu (this script)."
    exit /b 0
)
if /I "%rel%"=="tools\batch\boot-eveos.bat" (
    set "BATCH_NOTE=Canonical one-shot boot: one web surface + Gemini + bridges, guarded. Recommended."
    exit /b 0
)
if /I "%rel%"=="tools\batch\eveos-ports.bat" (
    set "BATCH_NOTE=Single source of truth for all EveOS ports. Edit here to change any port."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-lightpanda-bridge.bat" (
    set "BATCH_NOTE=Standalone Lightpanda controller for manual start/stop."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-camofox-bridge.bat" (
    set "BATCH_NOTE=Standalone Camofox controller for manual start/stop."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-wikimedia-bridge.bat" (
    set "BATCH_NOTE=Legacy Wikimedia-only controller. The Popup bridge now covers Wikimedia fetches too."
    exit /b 0
)
if /I "%rel%"=="tools\batch\start-popup-bridge.bat" (
    set "BATCH_NOTE=Standalone Popup+Wikimedia bridge controller for in-site popups and compliant Wikipedia fetches."
    exit /b 0
)
set "BATCH_NOTE=Project-specific batch script."
exit /b 0
