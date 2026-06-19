@echo off
rem ============================================================
rem  EveOS - Canonical port definitions (SINGLE SOURCE OF TRUTH)
rem ------------------------------------------------------------
rem  Change a port HERE and every launcher picks it up:
rem    - boot-eveos.bat (canonical stack boot)
rem    - start-server.bat (master menu)
rem    - server\server-menu.bat, server\start-gemini*.bat
rem    - tools\batch\start-*-bridge.bat (the 4 bridge controllers)
rem
rem  Loaded via:  call "<project>\tools\windows\eveos-ports.bat"
rem  IMPORTANT: no setlocal here - these vars must propagate to
rem             the calling script.
rem ============================================================

rem -- EveOS web surface (the page you open) --
set "EVEOS_WEB_PORT=8765"

rem -- Gemini Live backend (one process owns WS + status) --
set "GEMINI_WS_PORT=9083"
set "GEMINI_STATUS_PORT=9084"
set "GEMINI_CONTROL_PORT=9082"

rem -- Browser / transport bridges --
set "LIGHTPANDA_BRIDGE_PORT=3037"
set "CAMOFOX_BRIDGE_PORT=3038"
set "WIKIMEDIA_BRIDGE_PORT=3039"
set "POPUP_BRIDGE_PORT=3040"

exit /b 0
