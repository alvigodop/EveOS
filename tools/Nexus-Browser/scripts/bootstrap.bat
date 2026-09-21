@echo off
cd /d "%~dp0.."
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [Nexus Browser] Node.js was not found on PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Nexus Browser] npm was not found on PATH.
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v 2^>nul') do set "NODE_VER=%%a"
if not defined NODE_VER (
  echo [Nexus Browser] Failed to determine Node.js version.
  exit /b 1
)

if "%NODE_VER:~0,1%"=="v" (
  set "NODE_MAJOR=%NODE_VER:~1%"
) else (
  set "NODE_MAJOR=%NODE_VER%"
)

if %NODE_MAJOR% LSS 18 (
  echo [Nexus Browser] Node.js 18 or higher is required. Detected %NODE_VER%.
  exit /b 1
)

if not exist "node_modules\ws\package.json" (
  echo [Nexus Browser] Installing dependencies...
  if exist "package-lock.json" (
    call npm ci
    if errorlevel 1 (
      echo [Nexus Browser] npm ci failed, falling back to npm install...
      call npm install
    )
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo [Nexus Browser] Dependency installation failed.
    exit /b 1
  )
)

exit /b 0
