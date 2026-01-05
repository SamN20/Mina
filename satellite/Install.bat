@echo off
:: Mina Satellite - One-Click Installer
:: Double-click this file to install!

title Mina Satellite Installer

:: Check for admin rights (optional, but can help with some edge cases)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo ========================================
    echo   Mina Satellite Installer
    echo ========================================
    echo.
    echo Note: Running without admin rights
    echo This is OK, but if installation fails,
    echo try right-clicking and "Run as administrator"
    echo.
    timeout /t 3 >nul
)

:: Run the PowerShell installer
echo Starting installer...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0advanced\install_satellite.ps1"

if %errorlevel% neq 0 (
    echo.
    echo Installation encountered an error.
    pause
    exit /b 1
)

exit /b 0
