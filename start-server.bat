@echo off
REM Start the Fandom Discovery Toolkit Server

echo ========================================
echo   Fandom Discovery Toolkit Server
echo ========================================
echo.

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

REM Display Python version
echo [OK] Python found:
python --version
echo.

REM Kill any existing instances of python-server.py
echo [INFO] Cleaning up existing server instances...
wmic process where "name='python.exe' and commandline like '%%python-server.py%%'" call terminate >nul 2>nul
timeout /t 1 /nobreak >nul


REM Check if port 3000 is already in use
netstat -ano | findstr ":3000" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Port 3000 is in use. Killing existing process...
    FOR /F "tokens=5" %%a IN ('netstat -aon ^| find ":3000" ^| find "LISTENING"') DO (
        if "%%a" NEQ "0" (
            echo Killing PID %%a...
            taskkill /f /pid %%a >nul 2>nul
        )
    )
    REM Wait a moment for release
    timeout /t 2 /nobreak >nul
)

REM Start the server
echo [OK] Starting server on port 3000...
echo.
python python-server.py 3000

REM If the server fails to start, wait for user input before closing
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server failed to start. Check the messages above.
    pause
    exit /b 1
)

pause