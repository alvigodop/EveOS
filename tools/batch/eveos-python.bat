@echo off
rem Resolve one canonical Python interpreter for every EveOS launcher.
rem Prefer the documented project virtual environment, then fall back to PATH.

if defined EVEOS_PYTHON (
    "%EVEOS_PYTHON%" --version >nul 2>nul
    if not errorlevel 1 exit /b 0
    set "EVEOS_PYTHON="
)

set "_EVEOS_PYTHON_ROOT=%~dp0..\.."
if exist "%_EVEOS_PYTHON_ROOT%\.venv\Scripts\python.exe" (
    set "EVEOS_PYTHON=%_EVEOS_PYTHON_ROOT%\.venv\Scripts\python.exe"
)

if not defined EVEOS_PYTHON (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        if not defined EVEOS_PYTHON set "EVEOS_PYTHON=%%P"
    )
)

set "_EVEOS_PYTHON_ROOT="
if not defined EVEOS_PYTHON exit /b 1
"%EVEOS_PYTHON%" --version >nul 2>nul
exit /b %ERRORLEVEL%
