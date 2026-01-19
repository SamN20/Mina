# Vision Client Troubleshooting

## Fixed Issues

I've updated the installation and startup scripts to show errors properly:

### Changes Made

1. **Install Vision.bat** - Now pauses at the end to show completion message
2. **Start Vision.bat** - Now runs with visible console to show errors
3. **vision_gui.py** - Added better error handling and import checks

## If Install Vision.bat Closes Immediately

The PowerShell installer should now stay open and wait for you to press a key. If it still closes immediately:

1. **Run PowerShell directly**:
   ```powershell
   cd C:\path\to\Mina\satellite
   powershell.exe -ExecutionPolicy Bypass -File advanced\install_vision.ps1
   ```

2. **Check for errors** - Look for red error messages in the PowerShell window

3. **Common issues**:
   - Python not installed or not in PATH
   - No internet connection (needed for pip installs)
   - Antivirus blocking PowerShell execution

## If Start Vision.bat Closes Without Opening GUI

The script now runs with a visible console window. You should see error messages if something fails.

### Check These:

1. **Python is installed**:
   ```cmd
   python --version
   ```
   Should show Python 3.10 or higher

2. **tkinter is available**:
   ```cmd
   python -c "import tkinter"
   ```
   Should not show any errors

3. **Files exist**:
   - `satellite/advanced/vision_gui.py`
   - `satellite/advanced/vision_client.py`

4. **Dependencies installed**:
   ```cmd
   python -c "import socketio; import cv2; import numpy"
   ```
   Should not show import errors

### Manual Test

Try running the GUI directly:

```cmd
cd C:\path\to\Mina\satellite\advanced
python vision_gui.py
```

This will show any Python errors directly in the console.

### Common Errors

**"No module named 'vision_client'"**
- Make sure you're running from the `advanced` folder, or
- Check that `vision_client.py` exists in the `advanced` folder

**"No module named 'tkinter'"**
- Reinstall Python and ensure tkinter is included
- On some Linux systems, install: `sudo apt-get install python3-tk`

**"No module named 'cv2'" or "No module named 'opencv-python'"**
- Run `Install Vision.bat` to install dependencies
- Or manually: `pip install opencv-python`

**"Webcam not available"**
- This is OK - vision features will work but motion/face detection won't
- Check Windows camera permissions
- Ensure no other app is using the camera

## Getting More Debug Info

If you want to see exactly what's happening:

1. **Open Command Prompt** (not double-click the .bat file)
2. **Navigate to satellite folder**:
   ```cmd
   cd C:\path\to\Mina\satellite
   ```
3. **Run the batch file**:
   ```cmd
   "Start Vision.bat"
   ```
   Or run Python directly:
   ```cmd
   python advanced\vision_gui.py
   ```

This will show all output and errors in the console.

## Still Having Issues?

1. Check that the main Satellite client works (to verify Python setup is OK)
2. Compare the working `Start Satellite.bat` with `Start Vision.bat`
3. Check Windows Event Viewer for any system errors
4. Try running as Administrator
