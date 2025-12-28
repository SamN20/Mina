# Mina - AI Voice Assistant for Discord

Mina is a highly capable Discord voice bot that uses AI (LLMs) to listen, understand, and respond to users in voice channels. She features real-time transcription, a persistent memory system, and a "Satellite" architecture to control media on your local PC.

## Features
- 🎙️ **Real-time Transcription**: Uses Vosk (offline) or API-based transcription.
- 🧠 **AI Intelligence**: Powered by Gemini or OpenRouter (Mistral/Llama).
- 💾 **Memory System**: Remembers user facts and conversations across sessions.
- 🔊 **TTS**: High-quality Text-to-Speech (Edge TTS, Azure).
- 🌤️ **Weather Reports**: Real-time weather updates for any city.
- 📝 **Smart Reminders**: Set reminders via Voice or DM, including "On Join" reminders.
- 📜 **Conversation Summaries**: Ask Mina to catch you up on what you missed.
- 🎛️ **Soundboard**: Play sound effects via voice commands.
- 🛰️ **Satellite Client**: Control your PC's media (Spotify, YouTube) via voice commands ("Mina, pause music").
- ⚙️ **Configurable**: Customizable wake words, personality, and voices.

## New Features & Commands

### 🌤️ Weather
Ask for weather updates anywhere in the world.
- "Mina, what's the weather in London?"
- "Mina, do I need an umbrella in Seattle?"

### 📜 Conversation Summary
Mina can summarize recent conversations so you can catch up quickly.
- "Mina, catch me up." (Summarizes last 30 mins)
- "Mina, summarize the last hour."
- "Mina, what did we talk about?"

### 🎛️ Soundboard
Play sound effects stored in `data/sounds/`.
- "Mina, play sound airhorn."
- "Mina, play effect sad trombone."
*(Add your own `.mp3` files to `data/sounds/`)*

### 📝 Enhanced Reminders
**Voice:**
- "Remind me to take out the trash in 10 minutes."

**Direct Messages (DM):**
- DM Mina: "Remind me to check the logs in 1 hour."
- **On Join:** DM Mina: "Remind me next time I join to say hi to Sam."
  - Mina will remember this and speak it out the moment you join a voice channel she is in.

### 👻 Ghost Mode
If enabled, Mina can perform actions even when not permanently in a channel.
- If you join a channel and have an "On Join" reminder, Mina will briefly join, play your theme song, deliver the reminder, and then leave.

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
    - Download the Vosk small model (40MB, vosk-model-small-en-us-0.15) - lightweight and efficient.

3.  **Start the Bot**
    ```bash
    node index.js
    ```
    (Or use `start_bot.bat` on Windows)

## Vosk Model Selection

Mina uses **vosk-model-small-en-us-0.15** (40MB) by default, which is:
- ✅ Fast and lightweight (low CPU/memory usage)
- ✅ Works well for clear speech
- ✅ Suitable for servers with limited resources
- ✅ Audio is now properly downsampled to 16kHz for optimal accuracy

**Alternative Models:**

If you have more powerful hardware (8+ CPU cores, 16GB+ RAM) and want better accuracy, you can manually switch to a larger model:

1. Download a larger model from [Vosk Models](https://alphacephei.com/vosk/models/)
2. Extract to `models/` directory
3. Update `MODEL_PATH` in `transcribe.py`

**Note:** Larger models (100MB+) can cause high CPU usage and transcription failures on lower-spec servers. Stick with the small model unless you have significant resources available.

## GPU-Accelerated Transcription (NVIDIA GPUs)

If you have an NVIDIA GPU (like the P4000), you can use **Faster-Whisper** for much better transcription:

**Benefits:**
- 🚀 **10-100x faster** than CPU transcription
- 🎯 **Much higher accuracy** (state-of-the-art)
- 🌍 **Better accent handling**
- 🔇 **Better noise filtering**
- 👥 **Better multi-speaker handling**

**Setup:**
```bash
./setup-gpu-transcription.sh
```

Then add to your `.env` file:
```
TRANSCRIPTION_ENGINE=whisper
WHISPER_MODEL=base.en
```

**Model Options:**
- `tiny.en` - Fastest (39M params)
- `base.en` - Recommended balance (74M params)
- `small.en` - Very accurate (244M params)
- `medium.en` - Best accuracy (769M params)

Restart Mina after changing: `systemctl restart mina`

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
