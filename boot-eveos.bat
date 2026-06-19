@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"

rem ============================================================
rem  EveOS Canonical Boot - the standard "go-to" stack
rem ------------------------------------------------------------
rem  Brings up ONE EveOS web surface + the Gemini backend +
rem  the bridges, each GUARDED so nothing double-launches and
rem  no redundant port-states pile up (no more 3000-vs-8765).
rem
rem  Ports come from the single source of truth:
rem    tools\windows\eveos-ports.bat
rem
rem  Usage:
rem    boot-eveos.bat            Boot standard stack (canonical web port)
rem    boot-eveos.bat <port>     Boot standard stack on a custom web port
rem ============================================================

call "%PROJECT_ROOT%\tools\windows\eveos-ports.bat"
if not defined EVEOS_WEB_PORT set "EVEOS_WEB_PORT=8765"
if not defined GEMINI_WS_PORT set "GEMINI_WS_PORT=9083"
if not defined GEMINI_STATUS_PORT set "GEMINI_STATUS_PORT=9084"
if not defined GEMINI_CONTROL_PORT set "GEMINI_CONTROL_PORT=9082"
if not defined LIGHTPANDA_BRIDGE_PORT set "LIGHTPANDA_BRIDGE_PORT=3037"
if not defined CAMOFOX_BRIDGE_PORT set "CAMOFOX_BRIDGE_PORT=3038"
if not defined POPUP_BRIDGE_PORT set "POPUP_BRIDGE_PORT=3040"

set "WEB_PORT=%~1"
if not defined WEB_PORT set "WEB_PORT=%EVEOS_WEB_PORT%"

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Install from https://www.python.org/downloads/ ^(enable "Add to PATH"^).
    pause
    exit /b 1
)

echo ========================================
echo   EveOS Canonical Boot
echo ========================================
echo   Web surface : http://127.0.0.1:%WEB_PORT%/EveOS.html
echo   Ports source: tools\windows\eveos-ports.bat
echo.

rem --- 1. EveOS web (single instance, guarded) ---
call :PortInUse "%WEB_PORT%" WEB_PID
if defined WEB_PID (
    echo [OK]    EveOS web already running on port %WEB_PORT% ^(PID !WEB_PID!^).
) else (
    echo [START] EveOS web on port %WEB_PORT%...
    start "EveOS %WEB_PORT%" cmd /k "cd /d ""%PROJECT_ROOT%"" && python server/python-server.py %WEB_PORT%"
)

rem --- 2. Gemini backend + file-mode control helper (start-gemini guards internally) ---
echo [BOOT]  Ensuring Gemini backend ^(WS %GEMINI_WS_PORT% / status %GEMINI_STATUS_PORT%^)...
call "%PROJECT_ROOT%\server\start-gemini.bat" >nul 2>nul
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
if exist "%PROJECT_ROOT%\tools\camofox-runtime\node_modules\@askjo\camofox-browser\server.js" (
    call :EnsureBridge "Camofox        " "%CAMOFOX_BRIDGE_PORT%" "server\bridges\camofox-bridge.py"
) else (
    echo [SKIP]  Camofox bridge - runtime not installed.
)

rem  Wikimedia bridge is intentionally NOT booted: the popup bridge
rem  already covers compliant Wikimedia/Wikipedia transport. Start it
rem  explicitly from start-server.bat if you ever need it standalone.

echo.
echo ========================================
echo   Boot complete.
echo   Open: http://127.0.0.1:%WEB_PORT%/EveOS.html
echo ========================================
timeout /t 4 /nobreak >nul
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
start "EveOS %_LABEL%" cmd /k "cd /d ""%PROJECT_ROOT%"" && set ""EVEOS_PROJECT_ROOT=%PROJECT_ROOT%"" && python ""%_SCRIPT%"" %_PORT%"
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
rem Uses the SAFE trailing-space regex so ":3000" never matches ":30000".
set "%~2="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%~1 .*LISTENING"') do (
    set "%~2=%%P"
    goto :PortInUseDone
)
:PortInUseDone
exit /b 0
