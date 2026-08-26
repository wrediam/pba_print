@echo off
REM ============================================================
REM  Install Church Printer.bat
REM
REM  Double-click this to set up the church copier on a Windows PC.
REM  It re-launches itself as administrator (adding printers needs
REM  admin), then runs Install-ChurchPrinter.ps1 next to it with an
REM  execution-policy bypass so the unsigned script runs without
REM  changing this machine's PowerShell policy.
REM ============================================================

set "PS1=%~dp0Install-ChurchPrinter.ps1"

REM Are we already elevated? net session only succeeds as admin.
net session >nul 2>&1
if %errorlevel% NEQ 0 (
	echo Requesting administrator rights...
	powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
	exit /b
)

if not exist "%PS1%" (
	echo ERROR: Install-ChurchPrinter.ps1 was not found next to this file.
	echo Keep both files together in the same folder.
	pause
	exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
