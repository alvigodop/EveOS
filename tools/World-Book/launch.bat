@echo off
setlocal
cd /d "%~dp0"

if exist "app\assets\js\app.js" del /q "app\assets\js\app.js" >nul 2>nul
if exist "app\assets\js\taxonomy.js" del /q "app\assets\js\taxonomy.js" >nul 2>nul

where py >nul 2>nul
if %errorlevel%==0 (
  py server.py
) else (
  python server.py
)

echo.
echo World Book stopped.
pause
