@echo off
setlocal enabledelayedexpansion

:: Set the working directory to the script's location
cd /d "%~dp0"

:: Handle stop command from external calls
if "%1"=="stop" (
    call :StopAllServers
    exit /b
)

:: Ensure Python is in the PATH
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Python not found in PATH. Please install Python and add it to your PATH.
    pause
    exit /b 1
)

:: Go directly to menu without starting servers
goto :MainMenu

:MainMenu
cls
echo ====================================
echo Gemini Backend Management Console
echo ====================================
echo.
echo Current Status:
call :CheckServerStatus "Launcher Server" "9084"
call :CheckServerStatus "Main Server" "9083"
call :CheckServerStatus "HTTP Server" "8000"
echo.
echo Options:
echo [1] Start Launcher Server (9084)
echo [2] Start Main Server (9083)
echo [3] Start HTTP Server (8000)
echo [4] Stop Launcher Server (9084)
echo [5] Stop Main Server (9083)
echo [6] Stop HTTP Server (8000)
echo [7] Stop All Servers
echo [8] Start All Servers
echo [9] Exit
echo [10] Run Server Control (Auto-start Web server and open monitor)
echo [11] Open Server Monitor
echo.
set /P choice="Enter your choice (1-11): "

if "%choice%"=="1" (
    call :StopServer "Launcher Server" "9084"
    timeout /t 2 /nobreak >nul
    call :StartServer "Launcher Server" "gemini-backend/environment_setup/server_launcher.py" "9084"
    goto :MainMenu
)
if "%choice%"=="2" (
    call :StopServer "Main Server" "9083"
    timeout /t 2 /nobreak >nul
    call :StartServer "Main Server" "gemini-backend/interactions/main.py" "9083"
    goto :MainMenu
)
if "%choice%"=="3" (
    call :StopServer "HTTP Server" "8000"
    timeout /t 2 /nobreak >nul
    echo Starting HTTP Server in minimized window...
    start "HTTP Server Port 8000" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/http_server.py --port 8000 2>&1"
    goto :MainMenu
)
if "%choice%"=="4" (
    call :StopServer "Launcher Server" "9084"
    goto :MainMenu
)
if "%choice%"=="5" (
    call :StopServer "Main Server" "9083"
    goto :MainMenu
)
if "%choice%"=="6" (
    call :StopServer "HTTP Server" "8000"
    goto :MainMenu
)
if "%choice%"=="7" (
    call :StopAllServers
    goto :MainMenu
)
if "%choice%"=="8" (
    :: Stop all existing servers
    call :StopAllServers
    timeout /t 2 /nobreak >nul

    :: Start Launcher Server
    echo Starting Launcher Server...
    start "Launcher Server Port 9084" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/server_launcher.py"
    timeout /t 2 /nobreak >nul

    :: Start Main Server
    echo Starting Main Server...
    start "Main Server Port 9083" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/interactions/main.py --port 9083 2>&1"
    timeout /t 2 /nobreak >nul

    :: Start HTTP Server
    echo Starting HTTP Server...
    start "HTTP Server Port 8000" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/http_server.py --port 8000 2>&1"
    timeout /t 2 /nobreak >nul

    goto :MainMenu
)
if "%choice%"=="9" (
    exit /b
)
if "%choice%"=="10" (
    echo Running server control with auto-start...
    start "" "%~dp0start-gemini.bat"
    goto :MainMenu
)
if "%choice%"=="11" (
    echo Opening Server Monitor...
    start http://localhost:8000/server/server_monitor.html
    goto :MainMenu
)
goto :MainMenu

:StopAllServers
echo.
echo Stopping all project servers...
echo Project ports: 9084 (Launcher), 9083 (Main), 8000 (HTTP)
echo.

:: Kill all Python processes first
echo Stopping all Python processes...
taskkill /F /FI "IMAGENAME eq python.exe" /T >nul 2>&1

:: Stop servers in reverse order
echo === Stopping HTTP Server (8000) ===
call :StopServer "HTTP Server" "8000"
timeout /t 2 /nobreak >nul

echo.
echo === Stopping Main Server (9083) ===
call :StopServer "Main Server" "9083"
timeout /t 2 /nobreak >nul

echo.
echo === Stopping Launcher Server (9084) ===
call :StopServer "Launcher Server" "9084"
timeout /t 2 /nobreak >nul

:: Final cleanup
echo.
echo === Final Cleanup ===
taskkill /F /FI "IMAGENAME eq python.exe" /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo === Final Status Check ===
call :CheckServerStatus "HTTP Server" "8000"
call :CheckServerStatus "Main Server" "9083"
call :CheckServerStatus "Launcher Server" "9084"

:: Verify all ports are free
set "all_stopped=1"
netstat -ano | findstr ":8000\|:9083\|:9084" >nul && set "all_stopped=0"

if "!all_stopped!"=="1" (
    echo.
    echo All servers stopped successfully.
) else (
    echo.
    echo WARNING: Some servers may still be running.
    echo Current port status:
    netstat -ano | findstr ":8000\|:9083\|:9084"
)
goto :eof

:StartServer
set "server_type=%~1"
set "script_name=%~2"
set "port_number=%~3"
echo Starting %server_type%...

:: Enhanced process cleanup for Main Server
if "%server_type%"=="Main Server" (
    echo Performing thorough cleanup for Main Server...
    taskkill /F /FI "WINDOWTITLE eq *Main Server Port 9083*" /T >nul 2>&1
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9083.*LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 3 /nobreak >nul
)

:: Check if script exists
if not exist "%script_name%" (
    echo ERROR: %script_name% not found
    goto :eof
)

:: Start the server based on type
if "%server_type%"=="HTTP Server" (
    start "HTTP Server Port 8000" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/http_server.py --port 8000 2>&1"
) else if "%server_type%"=="Main Server" (
    start "Main Server Port 9083" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/interactions/main.py --port 9083 2>&1"
) else if "%server_type%"=="Launcher Server" (
    start "Launcher Server Port 9084" /min cmd /c "cd /d "%~dp0" && python -u gemini-backend/environment_setup/server_launcher.py"
)

:: Give it time to start
timeout /t 3 /nobreak >nul
goto :eof

:StopServer
echo Stopping %~1...
:: Parameters: %1 = server name, %2 = port number
if "%~1"=="HTTP Server" (
    taskkill /F /FI "WINDOWTITLE eq *HTTP Server Port 8000*" /T >nul 2>&1
) else if "%~1"=="Main Server" (
    taskkill /F /FI "WINDOWTITLE eq *Main Server Port 9083*" /T >nul 2>&1
) else if "%~1"=="Launcher Server" (
    taskkill /F /FI "WINDOWTITLE eq *Launcher Server Port 9084*" /T >nul 2>&1
)

:: Then kill any process using the port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%~2.*LISTENING"') do (
    taskkill /F /PID %%a /T >nul 2>&1
)

timeout /t 2 /nobreak >nul
goto :eof

:CheckServerStatus
:: Parameters: %1 = server name, %2 = port number
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
