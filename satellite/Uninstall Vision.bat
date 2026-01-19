@echo off
:: Mina Vision Satellite Uninstaller

title Mina Vision Satellite Uninstaller

echo ========================================
echo   Mina Vision Satellite Uninstaller
echo ========================================
echo.

set "INSTALLATION_DIR=%~dp0"
set "CONFIG_DIR=%INSTALLATION_DIR%config"

echo This will remove:
echo  - Desktop shortcut
echo  - Start Menu shortcut
echo  - Configuration files
echo  - Virtual environment (vision_env folder)
echo.
echo The installation folder will remain for manual deletion.
echo.

choice /C YN /M "Do you want to uninstall Mina Vision Satellite"
if %errorlevel% neq 1 goto :cancel

echo.
echo Uninstalling...

:: Remove Desktop shortcut
set "DESKTOP=%USERPROFILE%\Desktop"
if exist "%DESKTOP%\Mina Vision Satellite.lnk" (
    del "%DESKTOP%\Mina Vision Satellite.lnk"
    echo  - Removed desktop shortcut
)

:: Remove Start Menu shortcut
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
if exist "%STARTMENU%\Mina Vision Satellite.lnk" (
    del "%STARTMENU%\Mina Vision Satellite.lnk"
    echo  - Removed Start Menu shortcut
)

:: Remove configuration
if exist "%CONFIG_DIR%\vision_config.bat" (
    del "%CONFIG_DIR%\vision_config.bat"
    echo  - Removed configuration
)

:: Remove virtual environment
if exist "%INSTALLATION_DIR%vision_env" (
    rmdir /s /q "%INSTALLATION_DIR%vision_env"
    echo  - Removed virtual environment
)

echo.
echo ==========================================
echo   Uninstall Complete
echo ==========================================
echo.
echo Shortcuts, configuration, and virtual environment removed.
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
