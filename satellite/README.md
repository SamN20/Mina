# Mina Satellite Client 🛰️

The **Satellite Client** is a lightweight Python script that runs on your local computer. It connects to the main Mina Bot server and allows you to control your PC's media playback using voice commands.

## Features
- ⏯️ **Play/Pause**: "Mina, pause music."
- ⏭️ **Next/Previous**: "Mina, next song."
- 🎵 **Now Playing**: "Mina, what's playing?" (Reads Windows Media info).

## Prerequisites
- **OS**: Windows 10/11 (Required for `winsdk` media info).
- **Python**: 3.10 or higher.

## Installation

1.  **Navigate to the project root**:
    ```powershell
    cd path/to/MinaBot
    ```

2.  **Install Dependencies** (using the main `requirements.txt` or manual pip):
    ```powershell
    pip install python-socketio[client] pyautogui winsdk
    ```
    *(Note: If you ran `setup.js` for the main bot, these are already in the `venv` folder.)*

## Configuration

The client needs to know **who you are** (your Discord User ID) and where the bot is hosted. You can set these via Environment Variables.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DISCORD_USER_ID` | **Required**. Your Discord User ID. | *None* |
| `SATELLITE_SERVER` | URL of the Mina Bot. | `http://localhost:3001` |
| `SATELLITE_TOKEN` | Auth token (must match Bot's .env). | `secret123` |

### Setting User ID (Powershell)
```powershell
$env:DISCORD_USER_ID="123456789012345678"
```
*(You can also hardcode this in `client.py` if you prefer, but don't commit it!)*

## Usage

1.  **Start the Client**:
    ```powershell
    python satellite/client.py
    ```
    *Or if using the main venv:*
    ```powershell
    ../venv/Scripts/python client.py
    ```

2.  **Verify Connection**:
    You should see:
    > [Satellite] Connected to Server!
    > [Satellite] Ready for commands...

3.  **Test**:
    Join a voice channel with Mina and say *"Mina, pause music"*.

## Troubleshooting
- **Invalid Token**: Ensure `SATELLITE_TOKEN` matches the one in the Bot's `.env`.
- **Connection Refused**: Ensure the Bot is running (`node index.js`) and the port (3001) is open.
- **Media Info fails**: Ensure you are on Windows and have an active media session (Spotify, YouTube, etc.) visible in the Windows volume overlay.
