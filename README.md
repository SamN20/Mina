# Mina - AI Voice Assistant for Discord

Mina is a highly capable Discord voice bot that uses AI (LLMs) to listen, understand, and respond to users in voice channels. She features real-time transcription, a persistent memory system, and a "Satellite" architecture to control media on your local PC.

## Features
- 🎙️ **Real-time Transcription**: Uses Vosk (offline) or API-based transcription.
- 🧠 **AI Intelligence**: Powered by Gemini or OpenRouter (Mistral/Llama).
- 💾 **Memory System**: Remembers user facts and conversations across sessions.
- 🔊 **TTS**: High-quality Text-to-Speech (Edge TTS, Azure).
- 🛰️ **Satellite Client**: Control your PC's media (Spotify, YouTube) via voice commands ("Mina, pause music").
- ⚙️ **Configurable**: Customizable wake words, personality, and voices.

## Installation

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- FFmpeg (Added to PATH)
- A Discord Bot Token [Get it here](https://discord.com/developers/applications)

### Quick Start
1.  **Clone the repo**
2.  **Run Setup**
    ```bash
    node setup.js
    ```
    This script will:
    - Create configuration files (`.env`, `ai_config.txt`).
    - Install Node.js dependencies.
    - Create a Python virtual environment (`venv`) and install required packages (`vosk`, `winsdk`, etc.).

3.  **Start the Bot**
    ```bash
    node index.js
    ```
    (Or use `start_bot.bat` on Windows)

## Configuration
- **Wake Words**: stored in `settings.json`. Default: `['mina', 'nina', 'tina']`.
- **Personality**: Edit `ai_config.txt` to change how the bot behaves.
- **API Keys**: Stored in `.env`.

## Satellite Client (Remote Control)
To enable Mina to control your PC (e.g., "Pause music", "What's playing?"):

1.  **Ensure you are on Windows** (support for `winsdk`).
2.  **Set your User ID**:
    - The client needs to know which Discord User it belongs to.
    - Set the environment variable `DISCORD_USER_ID` or edit `satellite/client.py` (not recommended).
    ```powershell
    $env:DISCORD_USER_ID="YOUR_DISCORD_ID"
    ```
3.  **Run the Client**:
    ```bash
    call venv\Scripts\activate
    python satellite/client.py
    ```
    (Or use `start_client.bat`)

Now say *"Mina, what's playing?"* or *"Mina, next song"*!

## Commands
- `/join`: Join your voice channel.
- `/leave`: Leave the channel.
- `/profile view`: View what the AI knows about you.
- `/profile clear`: Clear your memory profile.

## Privacy
- All transcriptions are processed locally or via secure APIs.
- Memory is stored locally in `data/memory.json`.
- You can opt-out of memory logging using `/profile privacy`.

## License
MIT
