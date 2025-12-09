@echo off
:: Mina Satellite Client - All-in-One Launcher
:: Just double-click this file to start!

echo ========================================
echo   Mina Satellite Client
echo ========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    echo.
    pause
    exit /b 1
)

:: Check if dependencies are installed (check for socketio)
python -c "import socketio" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing required packages...
    echo This will only happen once and may take a minute...
    echo.
    
    :: Try installing with pre-built wheels first
    pip install python-socketio[client] pyautogui
    
    :: Try to install winsdk, but don't fail if it doesn't work
    echo.
    echo Installing Windows SDK package...
    echo (This may fail if you don't have Visual Studio Build Tools installed)
    echo.
    pip install winsdk >nul 2>&1
    
    if %errorlevel% neq 0 (
        echo.
        echo WARNING: winsdk installation failed. 
        echo The "What's playing?" feature will not work.
        echo.
        echo To fix this, install Visual Studio Build Tools from:
        echo https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
        echo Then run this script again.
        echo.
        echo Press any key to continue without winsdk...
        pause >nul
    )
    
    echo.
    echo Installation complete!
    echo.
)

:: Start the GUI client
echo Starting satellite client...
echo.

python advanced/satellite_gui.py

if %errorlevel% neq 0 (
    echo.
    echo Client stopped with an error
    pause
)
