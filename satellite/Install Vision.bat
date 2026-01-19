@echo off
:: Mina Vision Satellite - One-Click Installer
:: Double-click this file to install!

title Mina Vision Satellite Installer

:: Check for admin rights (optional, but can help with some edge cases)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo ========================================
    echo   Mina Vision Satellite Installer
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
echo ========================================
echo.

:: Run PowerShell and wait for it to complete
:: The PowerShell script will wait for user input before closing
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0advanced\install_vision.ps1"

set INSTALL_RESULT=%errorlevel%

echo.
echo ========================================
echo.

if %INSTALL_RESULT% neq 0 (
    echo.
    echo Installation encountered an error (exit code: %INSTALL_RESULT%).
    echo Please check the error messages above.
    echo.
    echo Common issues:
    echo   - Python not installed or not in PATH
    echo   - No internet connection (needed for pip installs)
    echo   - Antivirus blocking installation
    echo   - Insufficient permissions
    echo.
    pause
    exit /b 1
)

echo.
echo Installation completed successfully!
echo You can now run "Start Vision.bat" to launch the client.
echo.
pause
exit /b 0
