# Mina Satellite Client 🛰️

The **Satellite Client** is a lightweight application that runs on your local computer. It connects to the main Mina Bot server and allows you to control your PC's media playback using voice commands.

## Features
- ⏯️ **Play/Pause**: "Mina, pause music."
- ⏭️ **Next/Previous**: "Mina, next song."
- 🎵 **Now Playing**: "Mina, what's playing?" (Reads Windows Media info).
- 🎮 **GUI Controls**: Easy-to-use interface with pause, disconnect, and activity log
- 📊 **Status Indicators**: See connection status at a glance

## Prerequisites
- **OS**: Windows 10/11
- **Python**: 3.10 or higher from [python.org](https://www.python.org/downloads/)
  - ⚠️ During installation, check "Add Python to PATH"!
- **Visual Studio Build Tools** (optional, for "What's playing?" feature):
  - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  - Select "Desktop development with C++" workload
  - Not required for basic media controls (play/pause/next/prev)

## Quick Start (Windows)

1.  **Download** the satellite folder from this repository

2.  **Double-click** `Start Satellite.bat`
    - First run will automatically install dependencies (takes ~1 minute)
    - A setup window will appear
    
3.  **Configure** (first run only):
    - Enter your Discord User ID:
      - Enable Developer Mode in Discord (User Settings > Advanced)
      - Right-click your username and select "Copy User ID"
    - Enter Server address (provided by bot administrator)
    - Enter Authentication token (provided by bot administrator)
    - Click "Save & Start Client"

### Using the Satellite

The satellite GUI shows:
- **Connection Status**: Green = connected, Red = disconnected, Yellow = paused
- **Controls**:
  - **Connect**: Connect to the Mina bot server
  - **Pause**: Temporarily ignore commands (stays connected)
  - **Disconnect**: Disconnect from server
  - **Settings**: Change your configuration
- **Activity Log**: See all commands and events in real-time

Just leave the window open and use voice commands with Mina!

## Troubleshooting
- **Python not found**: Install Python 3.10+ from python.org and make sure to check "Add Python to PATH" during installation
- **winsdk installation failed**: This is optional. Basic controls (play/pause/next/prev) will still work. To get "What's playing?" feature, install Visual Studio Build Tools
- **Connection Failed**: Make sure you have internet connection and the Mina bot server is running
- **Authentication Error**: The satellite token doesn't match - contact the bot administrator
- **Media Info fails**: Ensure you have an active media session (Spotify, YouTube, etc.) and winsdk is installed

That's it! Just run `Start Satellite.bat` anytime you want to use voice control.

