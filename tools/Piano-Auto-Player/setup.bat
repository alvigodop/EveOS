@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:menu
cls
echo ============================================================
echo  EveOS Piano Auto Player - Setup and Repair
echo ============================================================
echo.
echo  The core player only needs Python 3 and is ready immediately.
echo  The optional engines are isolated and can be rebuilt at any time.
echo.
echo  [1] Start the core Piano player
echo  [2] Install or repair media-to-piano conversion
echo  [3] Install or repair the optional Hi-Fi engine
echo  [4] Install or repair both optional engines
echo  [5] Show installation status
echo  [6] Exit
echo.
set "CHOICE="
set /p "CHOICE=Choose an option: "

if "%CHOICE%"=="1" goto :start
if "%CHOICE%"=="2" goto :youtube
if "%CHOICE%"=="3" goto :hifi
if "%CHOICE%"=="4" goto :both
if "%CHOICE%"=="5" goto :status
if "%CHOICE%"=="6" exit /b 0
goto :menu

:start
call start.bat
goto :menu

:youtube
call setup-youtube-piano.bat
goto :menu

:hifi
call setup-hifi-piano.bat
goto :menu

:both
call setup-youtube-piano.bat
if errorlevel 1 goto :menu
call setup-hifi-piano.bat
goto :menu

:status
echo.
where py >nul 2>nul
if errorlevel 1 (echo  Core Python launcher: MISSING) else (echo  Core Python launcher: READY)
if exist ".youtube-piano-venv\Scripts\python.exe" (echo  Media conversion: READY) else (echo  Media conversion: NOT INSTALLED)
if exist ".piano-hifi-venv\Scripts\python.exe" (echo  Hi-Fi engine: READY) else (echo  Hi-Fi engine: NOT INSTALLED)
where ffmpeg >nul 2>nul
if errorlevel 1 (echo  FFmpeg: NOT ON PATH) else (echo  FFmpeg: READY)
echo.
pause
goto :menu
