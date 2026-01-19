# Mina Vision Satellite Setup Guide

The Vision Satellite client is **completely separate** from the main Satellite client. This ensures users who don't want vision features don't need to install vision dependencies.

## Quick Start

1. **Install**: Double-click `Install Vision.bat`
2. **Start**: Double-click `Start Vision.bat`
3. **Configure**: Enter your Discord User ID, server URL, and token
4. **Done**: Vision features are now active!

## What's Included

### Installation Files
- `Install Vision.bat` - One-click installer
- `Start Vision.bat` - Launcher (auto-installs dependencies if needed)
- `Uninstall Vision.bat` - Removes shortcuts and config
- `advanced/install_vision.ps1` - PowerShell installer script

### Client Files
- `advanced/vision_client.py` - Core vision client (can run standalone)
- `advanced/vision_gui.py` - GUI wrapper for easy use
- `advanced/vision_setup_gui.py` - Configuration wizard

### Configuration
- `config/vision_config.bat` - Stores your credentials (created on first run)
- `vision_version.txt` - Version file for auto-updates

## Separate from Main Satellite

The Vision client uses its **own virtual environment** (`vision_env/`) so:
- ✅ No conflicts with main satellite dependencies
- ✅ Users can install only what they need
- ✅ Vision dependencies (OpenCV, MediaPipe) are isolated
- ✅ Can run both clients simultaneously if desired

## Dependencies

### Required (Auto-installed)
- `python-socketio[client]` - WebSocket communication
- `aiohttp` - Async HTTP
- `opencv-python` - Computer vision
- `numpy` - Numerical computing
- `mediapipe` - Face detection
- `pystray` - System tray support
- `pillow` - Image processing

### Optional (Best-effort install)
- `pynput` - Idle detection
- `pyautogui` - Screen capture

## Features

### Phase 2 (Current)
- ✅ Motion detection (webcam)
- ✅ Face presence detection
- ✅ Brightness detection
- ✅ Idle detection (mouse/keyboard)
- ✅ Screen capture (on request)
- ✅ Webcam snapshot (on request)

### Privacy
- 🔒 **All processing is local** - No images sent unless explicitly requested
- 🔒 **Only events are sent** - Motion, face status, brightness, idle state
- 🔒 **No LLM calls** - Phase 2 is completely LLM-free

## Testing

See `VISION_TESTING.md` for detailed testing instructions without LLM calls.

## Troubleshooting

### "Webcam not available"
- Check Windows camera permissions
- Ensure no other app is using the camera
- Try restarting the client

### "Installation failed"
- Ensure Python 3.10+ is installed
- Check internet connection (needed for pip installs)
- Try running as administrator

### "Connection failed"
- Verify server URL format (should start with `ws://` or `wss://`)
- Check server is running
- Verify token is correct

## Next Steps

Once Phase 2 is working, Phase 3 will add:
- On-demand vision analysis ("Mina, what am I looking at?")
- Integration with conversation pipeline
- LLM vision calls only when explicitly requested
