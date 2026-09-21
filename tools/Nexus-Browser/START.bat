@echo off
setlocal
cd /d "%~dp0"

call scripts\bootstrap.bat
if errorlevel 1 (
  pause
  exit /b 1
)

for /f %%P in ('node -e "process.stdout.write(String(require('./runtime-config').servicePort()))"') do set "NEXUS_BROWSER_PORT=%%P"
echo [Nexus Browser] Starting http://127.0.0.1:%NEXUS_BROWSER_PORT%
node scripts\bridge-supervisor.js
if errorlevel 1 (
  pause
  exit /b 1
)
