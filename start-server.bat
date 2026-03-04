@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "SELF_PATH=%~f0"

set "GEMINI_MENU_BAT=%PROJECT_ROOT%\server\server-menu.bat"
set "GEMINI_AUTOSTART_BAT=%PROJECT_ROOT%\server\start-gemini.bat"

:MainMenu
cls
echo ========================================
echo   EveOS Startup Launcher
echo ========================================
echo.
echo [1] Start EveOS web server ^(python-server.py :3000^)
echo     - Runs the main EveOS site and modular-state API endpoints.
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
echo   Fandom Discovery Toolkit Server
echo ========================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Install Python from https://www.python.org/downloads/
    echo Make sure "Add Python to PATH" is enabled.
    echo.
    pause
    exit /b 1
)

echo [OK] Python found:
python --version
echo.

echo [INFO] Cleaning up existing server instances...
wmic process where "name='python.exe' and commandline like '%%python-server.py%%'" call terminate >nul 2>nul
timeout /t 1 /nobreak >nul

netstat -ano | findstr ":3000" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Port 3000 is in use. Killing existing process...
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
        if "%%a" NEQ "0" (
            echo Killing PID %%a...
            taskkill /f /pid %%a >nul 2>nul
        )
    )
    timeout /t 2 /nobreak >nul
)

echo [OK] Starting server on port 3000...
echo.
python python-server.py 3000

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server failed to start. Check messages above.
    pause
    exit /b 1
)
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
start "" "%targetBat%"
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
echo [OK] Launching:
echo      %pickedPath%
start "" "%pickedPath%"
exit /b 0

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
