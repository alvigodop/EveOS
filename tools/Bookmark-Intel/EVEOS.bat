@echo off
setlocal
cd /d "%~dp0"
if not defined BOOKMARK_INTEL_PORT set "BOOKMARK_INTEL_PORT=9077"
set "PY_EXE=.venv\Scripts\python.exe"
if not exist "%PY_EXE%" if exist "..\..\.venv\Scripts\python.exe" set "PY_EXE=..\..\.venv\Scripts\python.exe"
if not exist "%PY_EXE%" (
  py -3.12 -m venv .venv 2>nul || py -3 -m venv .venv || exit /b 1
  set "PY_EXE=.venv\Scripts\python.exe"
)
"%PY_EXE%" -c "import fastapi,httpx,bs4,pydantic,trafilatura,camoufox,uvicorn" >nul 2>&1
if errorlevel 1 "%PY_EXE%" -m pip install -r requirements.txt || exit /b 1
"%PY_EXE%" server.py --serve --host 127.0.0.1 --port %BOOKMARK_INTEL_PORT%
