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
    
    :: Install core dependencies
    pip install python-socketio[client] pynput
    
    echo.
    echo Core packages installed!
    echo.
    echo The setup wizard will now check for optional packages...
    echo - pynput: For media controls (especially in fullscreen games)
    echo - winsdk: For "What's playing?" feature
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
