@echo off
if "%~1"=="" exit /b 0
set "_START_SERVER_INSTANCE_LABEL=%~1"
shift
goto %_START_SERVER_INSTANCE_LABEL%
:LaunchEveInstance
set "INSTANCE_PORT=%~1"
set "INSTANCE_PACK_PATH=%~2"
set "INSTANCE_KIND=%~3"
set "PORT_MODE=%~4"

call "%PROJECT_ROOT%\tools\batch\eveos-python.bat"
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python or create the documented .venv.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Python found:
"%EVEOS_PYTHON%" --version
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
    call "%START_SERVER_BROWSER_BAT%" :EnsureLightpandaMonitor
)

start "EveOS Instance %INSTANCE_PORT%" /min cmd /k "%LP_FLAG%set ""EVEOS_MODULAR_ROOT=%INSTANCE_PACK_PATH%"" && cd /d ""%PROJECT_ROOT%"" && ""%EVEOS_PYTHON%"" server/python-server.py %INSTANCE_PORT%"
call "%START_SERVER_PATHS_BAT%" :TrackInstance "%INSTANCE_PORT%" "%INSTANCE_PACK_PATH%" "%INSTANCE_KIND%"
exit /b 0

:LaunchEvePortOnly
set "INSTANCE_PORT=%~1"

call "%PROJECT_ROOT%\tools\batch\eveos-python.bat"
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python or create the documented .venv.
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

start "EveOS Port %INSTANCE_PORT%" /min cmd /k "cd /d ""%PROJECT_ROOT%"" && ""%EVEOS_PYTHON%"" server/python-server.py %INSTANCE_PORT%"
call "%START_SERVER_PATHS_BAT%" :TrackInstance "%INSTANCE_PORT%" "active modular data-pack" "PortOnly"
exit /b 0
