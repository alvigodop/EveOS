@echo off
setlocal
cd /d "%~dp0\.."
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\check_codebase.py
) else (
  python tools\check_codebase.py
)
pause

node tools\check_integrity.js
