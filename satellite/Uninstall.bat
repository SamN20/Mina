@echo off
:: Mina Satellite Uninstaller

title Mina Satellite Uninstaller

echo ========================================
echo   Mina Satellite Uninstaller
echo ========================================
echo.

set "INSTALLATION_DIR=%~dp0"
set "CONFIG_DIR=%INSTALLATION_DIR%config"

echo This will remove:
echo  - Desktop shortcut
echo  - Start Menu shortcut
echo  - Configuration files
echo.
echo The installation folder will remain for manual deletion.
echo.

choice /C YN /M "Do you want to uninstall Mina Satellite"
if %errorlevel% neq 1 goto :cancel

echo.
echo Uninstalling...

:: Remove Desktop shortcut
set "DESKTOP=%USERPROFILE%\Desktop"
if exist "%DESKTOP%\Mina Satellite.lnk" (
    del "%DESKTOP%\Mina Satellite.lnk"
    echo  - Removed desktop shortcut
)

:: Remove Start Menu shortcut
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
if exist "%STARTMENU%\Mina Satellite.lnk" (
    del "%STARTMENU%\Mina Satellite.lnk"
    echo  - Removed Start Menu shortcut
)

:: Remove configuration
if exist "%CONFIG_DIR%\satellite_config.bat" (
    del "%CONFIG_DIR%\satellite_config.bat"
    echo  - Removed configuration
)

echo.
echo ========================================
echo   Uninstall Complete
echo ========================================
echo.
echo Shortcuts and configuration removed.
echo.
echo The installation folder remains at:
echo   %INSTALLATION_DIR%
echo.
echo You can safely delete this folder if you're done.
echo.

choice /C YN /M "Open the installation folder to delete it"
if %errorlevel% equ 1 (
    start explorer.exe "%INSTALLATION_DIR%"
    echo.
    echo Delete the folder when ready.
)

echo.
pause
exit /b 0

:cancel
echo.
echo Uninstall cancelled.
pause
exit /b 1
