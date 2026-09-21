@echo off
setlocal
cd /d "%~dp0"

call scripts\bootstrap.bat
if errorlevel 1 (
  echo [Nexus Browser] Verification FAILED: bootstrap error.
  if not defined NEXUS_BROWSER_NONINTERACTIVE if not defined BROWSER_AI_BRIDGE_NONINTERACTIVE pause
  exit /b 1
)

echo [Nexus Browser] Running test suite...
call npm test
if errorlevel 1 (
  echo [Nexus Browser] Verification FAILED.
  if not defined NEXUS_BROWSER_NONINTERACTIVE if not defined BROWSER_AI_BRIDGE_NONINTERACTIVE pause
  exit /b 1
)

echo [Nexus Browser] Verification PASSED.
exit /b 0
