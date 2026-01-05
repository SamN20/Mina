# Mina Satellite Client 🛰️

The **Satellite Client** is a lightweight application that runs on your local computer. It connects to the main Mina Bot server and allows you to control your PC's media playback using voice commands.

> **🚀 Quick Install**: Just double-click `Install.bat` and you're ready to go!

## Features

- ⏯️ **Play/Pause**: "Mina, pause music."
- ⏭️ **Next/Previous**: "Mina, next song."
- 🎵 **Now Playing**: "Mina, what's playing?" (Reads Windows Media info)
- 🎮 **Fullscreen Game Support**: Media controls work even during fullscreen games
- 🧭 **Mina View**: Open the VRM browser view directly from the app using your saved credentials
- 🔕 **System Tray Support**: Minimize to tray for a clean desktop
- ✨ **Professional UI**: No visible console windows
- 📊 **Status Indicators**: See connection status at a glance
- 📈 **Activity Log**: Monitor all commands and events in real-time
- ⚡ **Auto-Updates**: Checks GitHub for newer versions on startup

## Prerequisites

- **OS**: Windows 10/11
- **Python**: 3.10 or higher from [python.org](https://www.python.org/downloads/)
  - ⚠️ **During installation, check "Add Python to PATH"!**
- **Visual Studio Build Tools** (optional, for "What's playing?" feature):
  - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  - Select "Desktop development with C++" workload
  - Not required for basic media controls (play/pause/next/prev)

## Installation

### 🚀 Easiest Method (Recommended)

1. Download the entire `satellite` folder from [GitHub Releases](https://github.com/SamN20/Mina/releases/latest)
2. Extract to a folder (e.g., `C:\Users\YourName\AppData\Local\Mina\Satellite`)
   - ⚠️ Avoid leaving it in Downloads - the installer will warn you!
3. **Double-click `Install.bat`**
4. If you don't have Python:
   - The installer will open the Python download page
   - Install Python 3.10 or newer
   - **IMPORTANT**: Check "Add Python to PATH" during installation
   - Restart your computer and re-run `Install.bat`
5. Wait for the installer to complete (creates virtualenv, installs dependencies, creates shortcuts)
6. Double-click the **"Mina Satellite"** desktop shortcut to launch

That's it! The installer will:
- ✅ Check for Python (and guide you to install if needed)
- ✅ Set up everything automatically
- ✅ Create a desktop shortcut
- ✅ Install all dependencies (takes ~1 minute on first run)

### Alternative: Manual Installation

If you prefer manual setup:

1. Install Python 3.10+ from [python.org](https://www.python.org/downloads/)
   - **Must check "Add Python to PATH"** during installation
2. Extract the `satellite` folder
3. Open PowerShell in the `advanced` subfolder
4. Run: `.\install_satellite.ps1`
   - This creates a virtualenv, installs dependencies, and makes a Desktop shortcut

### First Launch

1. Double-click the **"Mina Satellite"** desktop shortcut (or run `Start Satellite.bat`)
2. A setup window will appear (first launch only)
3. The application will prompt to install optional packages:
   - **pynput** (recommended for fullscreen game support)
   - **winsdk** (optional, for "What's playing?" feature)

## Configuration

On first launch, you'll need to provide three pieces of information from your bot administrator:

### 1. Discord User ID
- Enable Developer Mode: Discord Settings → Advanced → Developer Mode (toggle ON)
- Right-click your username anywhere in Discord
- Select "Copy User ID"
- Paste into the setup window

### 2. Server Address
- Get from the bot administrator
- Format looks like: `wss://server.com` or `wss://ip:port`

### 3. Authentication Token
- Get from the bot administrator
- This is a secret code that authenticates you with the server

Click **"Save & Start Client"** to complete setup.

## Using the Satellite

### GUI Overview

The satellite window shows:

- **Connection Status**: 
  - 🟢 Green = connected
  - 🔴 Red = disconnected
  - 🟡 Yellow = paused

- **Control Buttons**:
  - **Connect**: Connect to the Mina bot server
  - **Pause**: Temporarily ignore commands (stays connected)
  - **Disconnect**: Disconnect from server
  - **Open Mina View**: Launches the VRM web viewer with your saved configuration
  - **Settings**: Change your configuration
  - **Create Shortcuts**: Create desktop/Start Menu shortcuts on demand

- **Activity Log**: Real-time display of all commands and events

### Basic Usage

Just leave the satellite window open and use voice commands with Mina:
- "Mina, pause music"
- "Mina, next song"
- "Mina, what's playing?"

### Tips & Tricks

- **Minimize to Tray**: The close button minimizes to system tray (find the icon in hidden icons)
- **Right-click Tray Icon**: Quick Show/Hide/Exit menu
- **View Avatar**: Click "Open Mina View" to see Mina's VRM avatar react in real-time
- **Pause Button**: Use to temporarily ignore commands while staying connected
- **Activity Log**: Check to see all commands as they happen
- **Updating**: If a newer version is available, the app will prompt you to download it on startup

## Updating

1. Download the latest version from [GitHub Releases](https://github.com/SamN20/Mina/releases/latest)
2. Extract to the same folder (overwrite old files)
3. Your settings are preserved in `config/satellite_config.bat`

The satellite app also checks GitHub for updates automatically on startup and will prompt you if a newer version is available.

## Uninstalling

1. Run `Uninstall.bat` from the satellite folder
2. Choose to remove shortcuts and configuration files
3. Manually delete the installation folder when prompted
4. Done!

## Troubleshooting

### Installation Issues

**"Python is not installed"**
- Download Python 3.10+ from [python.org](https://www.python.org/downloads/)
- **Must check "Add Python to PATH"** during installation
- Restart your computer after installing Python
- Run `Install.bat` again

**"Installation failed" or package errors**
- Make sure you have an internet connection
- Temporarily disable antivirus (it might block pip)
- Try right-clicking `Install.bat` → "Run as administrator"
- Ensure your installation folder is not in a read-only location

### Runtime Issues

**Media controls don't work in fullscreen games**
- The `pynput` package is required for this feature
- The setup should install it automatically
- If it didn't, run in the satellite folder:
  ```
  env\Scripts\pip install pynput
  ```

**"What's playing?" doesn't work**
- This requires the `winsdk` package
- Install Visual Studio Build Tools with C++ development tools
- Then run: `env\Scripts\pip install winsdk`
- If you can't install it, basic controls (play/pause/next/prev) still work without it

**Connection Failed**
- Double-check the server address and token with the administrator
- Make sure you have an internet connection
- Check if your firewall is blocking the connection
- Try clicking "Connect" button in the satellite window

**Authentication Error**
- The satellite token doesn't match the server's expectations
- Verify the token with your bot administrator
- Re-enter it in Settings and click "Save & Start Client"

**Can't find the tray icon**
- Right-click the taskbar clock area
- Select "Show hidden icons" or look in the system tray
- The Mina Satellite tray icon should appear there

### Creating Shortcuts Later

If you didn't create desktop shortcuts during installation:
- Click the "Create Shortcuts" button in the satellite app
- Choose Desktop, Start Menu, or Both
- Shortcuts will be created instantly

## Advanced Features

### Auto-Update System

The satellite client automatically checks for new versions on startup:

1. Loads your local version from `satellite/version.txt`
2. Fetches the latest version from GitHub's main branch
3. Compares versions using semantic versioning
4. If a newer version is available, shows a prompt with a download link
5. This all happens in the background without delaying startup

If you want to manually check: Simply restart the application.

### Command-Line Client

For advanced users, there's also a CLI client available in `advanced/client.py`:

```
python advanced/client.py --server wss://server.com --token YOUR_TOKEN --user YOUR_USER_ID
```

This is useful for automation or scripting.

## Still Need Help?

- Check the activity log in the satellite window for error messages
- Ask in the Discord server - the community is happy to help!
- Contact your bot administrator if there are server-related issues

---

Made with ❤️ for the Mina community

