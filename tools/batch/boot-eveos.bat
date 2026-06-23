@echo off
rem ============================================================
rem  boot-eveos.bat  (compatibility shim)
rem ------------------------------------------------------------
rem  The canonical full-stack boot now lives in the single root
rem  launcher: start-server.bat (menu option [S], or "boot" arg).
rem  This shim just forwards there so old shortcuts / muscle
rem  memory keep working. All sub-bats live in tools\batch\.
rem ============================================================
call "%~dp0..\..\start-server.bat" boot
