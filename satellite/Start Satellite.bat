@echo off
setlocal
:: Mina Satellite Client - All-in-One Launcher
:: Prefer virtualenv python if present (created by install_satellite.ps1)

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

set "VENV_PY=%SCRIPT_DIR%env\Scripts\python.exe"
set "VENV_PYWN=%SCRIPT_DIR%env\Scripts\pythonw.exe"
set "VENV_PIP=%SCRIPT_DIR%env\Scripts\pip.exe"
set "PYTHON_CMD=%VENV_PY%"
set "PYTHONW_CMD=%VENV_PYWN%"
set "PIP_CMD=%VENV_PIP%"
if not exist "%VENV_PY%" (
    set "PYTHON_CMD=python"
    set "PYTHONW_CMD=pythonw"
    set "PIP_CMD=pip"
)

echo ========================================
echo   Mina Satellite Client
echo ========================================
echo.

:: Check if Python is installed
"%PYTHON_CMD%" --version >nul 2>&1
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
"%PYTHON_CMD%" -c "import socketio" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing required packages...
    echo This will only happen once and may take a minute...
    echo.
    
    :: Install all dependencies
    "%PIP_CMD%" install python-socketio[client] aiohttp pynput pyautogui winsdk pystray pillow
    
    echo.
    echo Packages installed!
    echo Note: Some optional packages may have failed - this is OK.
    echo The satellite client will work with available packages.
    echo.
)

:: Start the GUI client
echo Starting satellite client...
echo.
echo The application window will open shortly.
echo This console will close automatically.
echo.

start "" "%PYTHONW_CMD%" advanced/satellite_gui.py

:: Give it a moment to start, then exit
timeout /t 2 /nobreak >nul
exit /b 0
