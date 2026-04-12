@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

if /I "%~1"=="stop" (
    call :StopAllServers
    exit /b %ERRORLEVEL%
)

python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Python not found in PATH. Install Python and add it to PATH.
    pause
    exit /b 1
)

if not "%~1"=="" (
    call :HandleChoice "%~1"
    exit /b %ERRORLEVEL%
)

:MainMenu
cls
echo ====================================
echo Gemini Backend Management Console
echo ====================================
echo.
echo Current Status:
call :CheckServerStatus "Launcher Server" "9084"
call :CheckServerStatus "Main WebSocket Server" "9083"
echo.
echo Options:
echo [1] Start Launcher Server (9084)
echo [2] Start Main WebSocket Server (9083)
echo [3] Stop Launcher Server (9084)
echo [4] Stop Main WebSocket Server (9083)
echo [5] Stop All Servers
echo [6] Start All Servers
echo [7] Check Status
echo [8] Exit
echo.
echo Note: EveOS serves files via python-server.py (port 3000).
echo       These servers handle Gemini Live API connections only.
echo.
set /P "choice=Enter your choice (1-8): "
if "%choice%"=="" goto :MainMenu

call :HandleChoice "%choice%"
if "%choice%"=="8" exit /b 0
goto :MainMenu

:HandleChoice
set "choice=%~1"

if "%choice%"=="1" (
    call :StopServer "Launcher Server" "9084"
    timeout /t 2 /nobreak >nul
    call :StartServer "Launcher Server" "gemini-backend/environment_setup/server_launcher.py" "9084"
    exit /b 0
)
if "%choice%"=="2" (
    call :StopServer "Main WebSocket Server" "9083"
    timeout /t 2 /nobreak >nul
    call :StartServer "Main WebSocket Server" "gemini-backend/interactions/main.py" "9083"
    exit /b 0
)
if "%choice%"=="3" (
    call :StopServer "Launcher Server" "9084"
    exit /b 0
)
if "%choice%"=="4" (
    call :StopServer "Main WebSocket Server" "9083"
    exit /b 0
)
if "%choice%"=="5" (
    call :StopAllServers
    exit /b 0
)
if "%choice%"=="6" (
    call :StopAllServers
    timeout /t 2 /nobreak >nul

    echo Starting Launcher Server...
    start "Launcher Server Port 9084" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/server_launcher.py"
    timeout /t 2 /nobreak >nul

    echo Starting Main WebSocket Server...
    start "Main Server Port 9083" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/interactions/main.py --port 9083 2>&1"
    timeout /t 2 /nobreak >nul
    exit /b 0
)
if "%choice%"=="7" (
    echo.
    echo === Server Status ===
    call :CheckServerStatus "Launcher Server" "9084"
    call :CheckServerStatus "Main WebSocket Server" "9083"
    echo.
    pause
    exit /b 0
)
if "%choice%"=="8" (
    exit /b 0
)

rem Legacy compatibility: map old option numbers to new behavior
if "%choice%"=="10" (
    echo.
    echo NOTE: Auto-start monitor flow has been removed.
    echo Use option 6 to start all Gemini servers.
    echo EveOS serves files via python-server.py on port 3000.
    echo.
    call :HandleChoice "6"
    exit /b 0
)

echo Invalid choice: %choice%
exit /b 1

:StopAllServers
echo.
echo Stopping all Gemini servers...
echo Ports: 9084 (Launcher), 9083 (WebSocket)
echo.

echo === Stopping Main WebSocket Server (9083) ===
call :StopServer "Main WebSocket Server" "9083"
timeout /t 2 /nobreak >nul

echo.
echo === Stopping Launcher Server (9084) ===
call :StopServer "Launcher Server" "9084"
timeout /t 2 /nobreak >nul

echo.
echo === Final Status Check ===
call :CheckServerStatus "Main WebSocket Server" "9083"
call :CheckServerStatus "Launcher Server" "9084"

set "all_stopped=1"
netstat -ano | findstr ":9083\|:9084" >nul && set "all_stopped=0"

if "!all_stopped!"=="1" (
    echo.
    echo All servers stopped successfully.
) else (
    echo.
    echo WARNING: Some servers may still be running.
    netstat -ano | findstr ":9083\|:9084"
)
exit /b 0

:StartServer
set "server_type=%~1"
set "script_name=%~2"
set "port_number=%~3"
echo Starting %server_type%...

if "%server_type%"=="Main WebSocket Server" (
    echo Performing thorough cleanup for Main WebSocket Server...
    taskkill /F /FI "WINDOWTITLE eq *Main Server Port 9083*" /T >nul 2>&1
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9083.*LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 3 /nobreak >nul
)

if not exist "%script_name%" (
    echo ERROR: %script_name% not found
    exit /b 1
)

if "%server_type%"=="Main WebSocket Server" (
    start "Main Server Port 9083" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/interactions/main.py --port 9083 2>&1"
) else if "%server_type%"=="Launcher Server" (
    start "Launcher Server Port 9084" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/server_launcher.py"
)

timeout /t 3 /nobreak >nul
exit /b 0

:StopServer
echo Stopping %~1...
if "%~1"=="Main WebSocket Server" (
    taskkill /F /FI "WINDOWTITLE eq *Main Server Port 9083*" /T >nul 2>&1
) else if "%~1"=="Launcher Server" (
    taskkill /F /FI "WINDOWTITLE eq *Launcher Server Port 9084*" /T >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%~2.*LISTENING"') do (
    taskkill /F /PID %%a /T >nul 2>&1
)

timeout /t 2 /nobreak >nul
exit /b 0

:CheckServerStatus
set "server_name=%~1"
set "port=%~2"
set "is_running=0"
netstat -ano | findstr /R ":%port%.*LISTENING" >nul
if %ERRORLEVEL%==0 set "is_running=1"

if "!is_running!"=="1" (
    echo %server_name%: RUNNING ^(Port %port%^)
    exit /b 0
) else (
    echo %server_name%: STOPPED ^(Port %port%^)
    exit /b 1
)
