@echo off
if "%~1"=="" exit /b 0
set "_START_SERVER_STACK_LABEL=%~1"
shift
goto %_START_SERVER_STACK_LABEL%
:BootStandardStack
call "%PROJECT_ROOT%\tools\batch\eveos-python.bat"
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python or create the documented .venv.
    pause
    exit /b 1
)
echo.
echo ========================================
echo   EveOS Canonical Boot
echo ========================================
echo   Web + hotkeys + audio bypass: http://127.0.0.1:%EVEOS_WEB_PORT%/EveOS.html
echo.
rem --- 1. EveOS web (guarded). Hosts the soundboard, VB-Cable bypass and global hotkeys. ---
call :PortInUse "%EVEOS_WEB_PORT%" _WEB_PID
if defined _WEB_PID (
    echo [OK]    EveOS web already running on port %EVEOS_WEB_PORT% ^(PID !_WEB_PID!^).
) else (
    echo [START] EveOS web ^(hotkeys + audio bypass^) on port %EVEOS_WEB_PORT%...
    rem /min matches the Gemini Main window: spawns minimized so every EveOS server window opens in
    rem the same slim, out-of-the-way style instead of a wide console grabbing the screen.
    start "EveOS %EVEOS_WEB_PORT%" /min cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""PYTHONUNBUFFERED=1"" && ""%EVEOS_PYTHON%"" -u server/python-server.py %EVEOS_WEB_PORT%"
)
echo [INFO]  World Book follows its saved On/Off state on port %WORLD_BOOK_PORT%.
rem --- 2. Gemini backend + general EveOS file-mode control plane (guarded internally) ---
echo [BOOT]  Ensuring Gemini backend ^(WS %GEMINI_WS_PORT% / status %GEMINI_STATUS_PORT%^)...
call "%GEMINI_AUTOSTART_BAT%" >nul 2>nul
call :ReportPort "Gemini WebSocket" "%GEMINI_WS_PORT%"
call :ReportPort "Gemini control  " "%GEMINI_CONTROL_PORT%"
rem --- 3. Popup bridge (file:// popups + Wikimedia transport) ---
call :EnsureBridge "Popup bridge   " "%POPUP_BRIDGE_PORT%" "server\bridges\popup-bridge.py"
rem --- 4. Lightpanda bridge (only if the binary is present) ---
if exist "%PROJECT_ROOT%\bin\lightpanda" (
    call :EnsureBridge "Lightpanda     " "%LIGHTPANDA_BRIDGE_PORT%" "server\bridges\lightpanda-bridge.py"
) else (
    echo [SKIP]  Lightpanda bridge - binary not found ^(bin\lightpanda^).
)
rem --- 5. Camofox bridge (only if the runtime is installed) ---
if exist "%CAMOFOX_RUNTIME_SERVER%" (
    call :EnsureBridge "Camofox        " "%CAMOFOX_BRIDGE_PORT%" "server\bridges\camofox-bridge.py"
) else (
    echo [SKIP]  Camofox bridge - runtime not installed.
)
echo.
echo ========================================
echo   Boot complete. Open: http://127.0.0.1:%EVEOS_WEB_PORT%/EveOS.html
echo ========================================
exit /b 0

:EnsureBridge
rem %1=label  %2=port  %3=relative script path
set "_LABEL=%~1"
set "_PORT=%~2"
set "_SCRIPT=%PROJECT_ROOT%\%~3"
if not exist "%_SCRIPT%" (
    echo [SKIP]  %_LABEL% - script not found: %_SCRIPT%
    exit /b 0
)
call :PortInUse "%_PORT%" _BPID
if defined _BPID (
    echo [OK]    %_LABEL% already running on port %_PORT% ^(PID !_BPID!^).
    exit /b 0
)
echo [START] %_LABEL% on port %_PORT%...
rem Stagger each console spawn ~1s. On Win11 with Windows Terminal as the default terminal,
rem firing several `start ... cmd /k` windows back-to-back races the DefTerm/ConPTY handoff and
rem one tab dies with "[error 0x800700e8 ...] (the pipe is being closed)", leaving that bridge
rem down. Spacing the spawns lets each tab finish initializing before the next handoff.
ping 127.0.0.1 -n 2 >nul
rem /min: same slim, minimized style as the Gemini Main window (consistent across all servers).
start "EveOS %_LABEL%" /min cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""EVEOS_PROJECT_ROOT=%PROJECT_ROOT%"" && set ""PYTHONUNBUFFERED=1"" && ""%EVEOS_PYTHON%"" -u ""%_SCRIPT%"" %_PORT%"
exit /b 0

:ReportPort
set "_LABEL=%~1"
call :PortInUse "%~2" _RPID
if defined _RPID (
    echo [OK]    %_LABEL% running on port %~2 ^(PID !_RPID!^).
) else (
    echo [WARN]  %_LABEL% not detected on port %~2 yet ^(may still be starting^).
)
exit /b 0

:PortInUse
rem %1=port  %2=name of output var (set to listening PID, else empty).
set "%~2="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%~1 .*LISTENING"') do (
    set "%~2=%%P"
    goto :PortInUseDone
)
:PortInUseDone
exit /b 0
