@echo off
rem Resolve one canonical Python interpreter for every EveOS launcher.
rem Prefer the documented project virtual environment, then fall back to PATH.
rem Never execute an inherited EVEOS_PYTHON value until it has been validated as a real executable path.

if defined EVEOS_PYTHON call :ValidateInheritedPython
if defined EVEOS_PYTHON exit /b 0

for %%R in ("%~dp0..\..") do set "_EVEOS_PYTHON_ROOT=%%~fR"
if exist "%_EVEOS_PYTHON_ROOT%\.venv\Scripts\python.exe" (
    set "EVEOS_PYTHON=%_EVEOS_PYTHON_ROOT%\.venv\Scripts\python.exe"
)

if not defined EVEOS_PYTHON (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        if not defined EVEOS_PYTHON set "EVEOS_PYTHON=%%~fP"
    )
)

set "_EVEOS_PYTHON_ROOT="
if not defined EVEOS_PYTHON exit /b 1
"%EVEOS_PYTHON%" --version >nul 2>nul
exit /b %ERRORLEVEL%

:ValidateInheritedPython
for %%P in ("%EVEOS_PYTHON%") do (
    if /I "%%~xP"==".exe" if exist "%%~fP" (
        "%%~fP" --version >nul 2>nul
        if not errorlevel 1 (
            set "EVEOS_PYTHON=%%~fP"
            exit /b 0
        )
    )
)
rem Reject malformed/stale inherited values instead of passing them to Python as arguments.
set "EVEOS_PYTHON="
exit /b 0
