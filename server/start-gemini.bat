@echo off
setlocal enabledelayedexpansion

:: Set the working directory to the script's location
cd /d "%~dp0"

:: Ensure this script is executed from the correct project root
:: Ensure this script is executed from the correct project root
:: Removed hardcoded EXPECTED_PATH check for portability

:: Enable command output
echo Server Control Script Running...
echo Current Directory: %CD%

:: Get the command argument
set "command=%~1"
if "%command%"=="" (
    :: If no command specified, show menu and auto-start HTTP server
    echo Starting HTTP server and opening monitor...
    
    :: Kill any existing HTTP server process
    call :kill_port 8000
    timeout /t 2 >nul
    
    :: Start HTTP server
    echo Starting HTTP Server...
    start "HTTP Server" /min cmd /c "python gemini-backend/environment_setup/http_server.py --port 8000"
    
    :: Wait for server to start
    timeout /t 3 >nul
    
    :: Check if server started
    call :check_port 8000
    if !errorlevel! equ 0 (
        echo HTTP Server started successfully
        :: Open the monitor page
        timeout /t 2 >nul
        start http://localhost:8000/server/server_monitor.html
    ) else (
        echo WARNING: HTTP Server may not have started properly.
        echo Please check the server status and try again.
    )
    exit /b 0
)

echo Processing command: %command%

:: Verify required files exist
if not exist "gemini-backend/environment_setup/server_launcher.py" (
    echo Error: server_launcher.py not found
    exit /b 1
)
if not exist "gemini-backend/interactions/main.py" (
    echo Error: main.py not found
    exit /b 1
)
if not exist "gemini-backend/environment_setup/http_server.py" (
    echo Error: http_server.py not found
    exit /b 1
)

:: Function to check if a process is running on a port
:check_port
set "port=%~1"
netstat -ano | findstr ":%port%.*LISTENING" >nul
if %errorlevel% equ 0 (
    exit /b 0
) else (
    exit /b 1
)

:: Function to kill process on a port
:kill_port
set "port=%~1"
echo Attempting to kill processes on port %port%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%port%.*LISTENING"') do (
    echo Killing process with PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul
exit /b 0

:: Handle commands
if "%command%"=="1" (
    :: Start Launcher
    echo Starting Launcher Server...
    call :check_port 9084
    if !errorlevel! equ 0 (
        echo Port 9084 in use, stopping existing process...
        call :kill_port 9084
        timeout /t 2 >nul
    )
    start "Launcher Server" /min cmd /c "python gemini-backend/environment_setup/server_launcher.py"
    echo Started Launcher Server
    exit /b 0
)

if "%command%"=="2" (
    :: Start Main
    echo Starting Main Server...
    
    :: Kill any existing processes on port 9083
    call :kill_port 9083
    timeout /t 2 >nul
    
    :: Kill any existing python processes for main.py
    taskkill /F /FI "WINDOWTITLE eq Main Server*" /T >nul 2>&1
    taskkill /F /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq *main.py*" >nul 2>&1
    timeout /t 2 >nul
    
    :: Create a log directory if it doesn't exist
    if not exist "logs" mkdir logs
    
    :: Start main server with logging and error capture
    echo Launching main.py on port 9083...
    
    :: Create a temporary batch file to run the server and keep window open
    echo @echo off > run_main.bat
    echo cd /d "%~dp0" >> run_main.bat
    echo python -u gemini-backend/interactions/main.py --port 9083 >> run_main.bat
    echo echo. >> run_main.bat
    echo echo Server process exited with code %%errorlevel%% >> run_main.bat
    echo echo Press any key to close this window... >> run_main.bat
    echo pause >> run_main.bat
    
    :: Run the temporary batch file
    start "Main Server" cmd /k "run_main.bat"
    
    :: Wait longer for server to initialize
    timeout /t 8 >nul
    
    :: Check if process started and is listening on port
    call :check_port 9083
    if !errorlevel! equ 0 (
        echo Main Server started successfully on port 9083
    ) else (
        echo WARNING: Main Server may not have started properly
        echo Please check the server window for error messages
        
        :: Try one more time to verify after a longer wait
        timeout /t 5 >nul
        call :check_port 9083
        if !errorlevel! equ 0 (
            echo Main Server verified running after additional wait
        ) else (
            echo ERROR: Main Server failed to start properly
            echo Check the server window for error details
        )
    )
    exit /b 0
)

if "%command%"=="3" (
    :: Start HTTP
    echo Starting HTTP Server...
    call :check_port 8000
    if !errorlevel! equ 0 (
        echo Port 8000 in use, stopping existing process...
        call :kill_port 8000
        timeout /t 2 >nul
    )
    start "HTTP Server" /min cmd /c "python gemini-backend/environment_setup/http_server.py --port 8000"
    echo Started HTTP Server
    exit /b 0
)

if "%command%"=="4" (
    :: Stop Launcher
    echo Stopping Launcher Server...
    call :kill_port 9084
    echo Stopped Launcher Server
    exit /b 0
)

if "%command%"=="5" (
    :: Stop Main
    echo Stopping Main Server...
    call :kill_port 9083
    echo Stopped Main Server
    exit /b 0
)

if "%command%"=="6" (
    :: Stop HTTP
    echo Stopping HTTP Server...
    call :kill_port 8000
    echo Stopped HTTP Server
    exit /b 0
)

if "%command%"=="7" (
    :: Stop All
    echo Stopping all servers...
    call :kill_port 9084
    call :kill_port 9083
    call :kill_port 8000
    echo Stopped All Servers
    exit /b 0
)

if "%command%"=="8" (
    :: Start All
    echo Starting all servers...
    
    :: Start Launcher
    echo Starting Launcher Server...
    start "Launcher Server" cmd /k "title Launcher Server && cd /d "%~dp0" && python gemini-backend/environment_setup/server_launcher.py"
    timeout /t 2 >nul
    
    :: Start Main
    echo Starting Main Server...
    start "Main Server" cmd /k "title Main Server && cd /d "%~dp0" && python gemini-backend/interactions/main.py --port 9083"
    timeout /t 2 >nul
    
    :: Start HTTP
    echo Starting HTTP Server...
    start "HTTP Server" /min cmd /c "cd /d "%~dp0" && python gemini-backend/environment_setup/http_server.py --port 8000"
    echo Started All Servers
    exit /b 0
)

if "%command%"=="10" (
    :: Auto-start functionality
    echo Running Server Control with auto-start...
    
    :: First stop all servers
    echo Stopping any existing servers...
    call :kill_port 9084
    call :kill_port 9083
    call :kill_port 8000
    timeout /t 2 >nul
    
    :: Start HTTP server first
    echo Starting HTTP Server...
    start "HTTP Server" /min cmd /c "python server/environment_setup/http_server.py --port 8000"
    timeout /t 3 >nul
    
    :: Check if HTTP server started
    call :check_port 8000
    if !errorlevel! equ 0 (
        echo HTTP Server started successfully
        :: Open the monitor page
        timeout /t 2 >nul
        start http://localhost:8000/server_monitor.html
    ) else (
        echo WARNING: HTTP Server may not have started properly.
        echo Please check the server status and try again.
    )
    exit /b 0
)

echo Invalid command: %command%
exit /b 1 