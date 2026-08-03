@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
set "WORLD_BOOK_EXIT=%ERRORLEVEL%"

echo.
echo World Book stopped.
pause
exit /b %WORLD_BOOK_EXIT%
