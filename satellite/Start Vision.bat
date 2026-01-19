@echo off
setlocal
:: Mina Vision Satellite Client - All-in-One Launcher
:: Prefer virtualenv python if present (created by install_vision.ps1)

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" >nul

set "VENV_PY=%SCRIPT_DIR%vision_env\Scripts\python.exe"
set "VENV_PYWN=%SCRIPT_DIR%vision_env\Scripts\pythonw.exe"
set "VENV_PIP=%SCRIPT_DIR%vision_env\Scripts\pip.exe"
set "PYTHON_CMD=%VENV_PY%"
set "PYTHONW_CMD=%VENV_PYWN%"
set "PIP_CMD=%VENV_PIP%"
if not exist "%VENV_PY%" (
    set "PYTHON_CMD=python"
    set "PYTHONW_CMD=pythonw"
    set "PIP_CMD=pip"
)

echo ========================================
echo   Mina Vision Satellite Client
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
    "%PIP_CMD%" install python-socketio[client] aiohttp opencv-python numpy mediapipe pystray pillow pynput pyautogui
    
    echo.
    echo Packages installed!
    echo Note: Some optional packages may have failed - this is OK.
    echo The vision satellite client will work with available packages.
    echo.
)

:: Start the GUI client
echo Starting vision satellite client...
echo.

:: First, test if we can import tkinter (required for GUI)
"%PYTHON_CMD%" -c "import tkinter" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: tkinter is not available.
    echo tkinter should be included with Python installation.
    echo Please reinstall Python and ensure tkinter is included.
    echo.
    pause
    exit /b 1
)

:: Check if vision_gui.py exists
if not exist "%SCRIPT_DIR%advanced\vision_gui.py" (
    echo ERROR: vision_gui.py not found in advanced folder!
    echo Expected location: %SCRIPT_DIR%advanced\vision_gui.py
    echo.
    pause
    exit /b 1
)

:: Check if vision_client.py exists
if not exist "%SCRIPT_DIR%advanced\vision_client.py" (
    echo ERROR: vision_client.py not found in advanced folder!
    echo Expected location: %SCRIPT_DIR%advanced\vision_client.py
    echo.
    pause
    exit /b 1
)

:: Start the GUI client
:: Using python (not pythonw) so errors are visible if startup fails
echo Starting vision satellite client...
echo.
echo If the GUI doesn't appear, check for error messages above.
echo This console will stay open to show any errors.
echo.

"%PYTHON_CMD%" "%SCRIPT_DIR%advanced\vision_gui.py"

:: If we get here, the GUI closed
echo.
echo Vision client closed.
pause

:: Give it a moment to start, then exit
timeout /t 2 /nobreak >nul
exit /b 0
