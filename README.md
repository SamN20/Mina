# Mina - Advanced AI Voice Assistant for Discord

Mina is a context-aware AI Discord bot designed to hang out in voice channels, understand natural language, and interact with users. She features long-term memory, a persistent mood system, gaming integration, and autonomous conversation capabilities. Everything is built with low llm usage in mind to keep costs down, under free tier limits for most small servers.

## Key Features

### Advanced AI & Memory
*   **Natural Conversation**: Powered by LLMs (OpenRouter/Mistral), Mina understands context, slang, and nuance.
*   **Long-Term Memory**: Remembers users, past conversations, and personal details using Vector Search.
*   **Context Injection**: Automatically pulls relevant memories and gaming history into the conversation.
*   **Auto-Conversation**: Mina listens to the conversation and chimes in naturally without needing a wake word (configurable).

### Personality & Mood
*   **Tilt System**: Mina has a persistent "Tilt" level (0-100%) that affects her responses.
    *   **Happy**: Helpful, cheerful, uses emojis.
    *   **Tilted**: Sarcastic, short, might roast you.
    *   **Rage Quit**: If she gets too tilted (100%), she will leave the voice channel.
*   **Reactions**: Reacts to messages with context-aware emojis (e.g., "lol" -> 😂, "pizza" -> 🍕).

### Gaming Integration
*   **Backseat Gamer**: Notices what games you are playing and comments on them
*   **Squad Finder**: Ask "Who plays Minecraft?" to find friends who play specific games.
*   **Game Recommender**: Ask "What can we play?" to get suggestions based on the games owned by people currently in the voice channel.
*   **Activity Tracking**: Tracks game history, play frequency, and "Squad" social graphs.

### Analytics
*   **Heatmaps**: Tracks voice and message activity by hour and day.
*   **Social Graph**: Builds a weighted graph of who hangs out with whom.
*   **Status Tracking**: Monitors online/idle/dnd status patterns.

### Utilities
*   **Voice Transcriptions**: Real-time speech-to-text using Vosk/Whisper.
*   **Reminders**: Natural language reminders ("Remind me to take out the trash in 10 mins" or "Remind me when I join voice").
*   **Soundboard**: Play sound effects via voice command.
*   **Music Control**: Integrates with external media players via Satellite.
*   **Weather**: Get weather updates for any location.

---

## Installation & Setup

### Prerequisites
*   Node.js (v18+)
*   Python 3.8+ (for Transcription/Satellite)
*   FFmpeg
*   A Discord Bot Token
*   OpenRouter API Key (or other LLM provider)

### 1. Clone & Install
```bash
git clone https://github.com/SamN20/Mina.git
cd Mina
npm install
```

### 2. Configuration
Create a `.env` file in the root directory:
```env
DISCORD_TOKEN=your_discord_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id (optional, for faster dev deployment)
OPENROUTER_API_KEY=your_ai_key
```

### 3. Setup Models
Download the required voice recognition models:
```bash
node setup-model.js
```

### 4. Run
Start the bot:
```bash
node index.js
```
*Or use the provided service script:* `systemctl start mina`

---

## Usage

### Slash Commands
| Command | Description |
| :--- | :--- |
| `/join` | Summon Mina to your voice channel. |
| `/leave` | Dismiss Mina. |
| `/say` | Make Mina speak text (TTS). |
| `/manage_commands` | **(Admin)** Enable/Disable specific voice commands. |
| `/toggle_auto` | **(Admin)** Toggle Auto-Reply for Voice or Text separately. |
| `/toggleai` | Toggle AI generation on/off. |
| `/reminders` | View or delete active reminders. |
| `/profile` | View or clear your user profile/memory. |
| `/download` | Download your voice transcript for the day. |

### Voice Commands (Natural Language)
Mina listens for her wake word (default: "Mina", "Nina") or can be spoken to directly.

*   **General Chat**: "Mina, how are you?", "Mina, tell me a joke."
*   **Gaming**:
    *   "Who plays [Game]?"
    *   "What can we play?"
    *   "Does anyone play [Game]?"
*   **Reminders**:
    *   "Remind me to [task] in [time]."
    *   "Remind me to [task] when I join voice."
*   **Utilities**:
    *   "What is the weather in [City]?"
    *   "Summarize the conversation."
    *   "Set a timer for [time]."

---

## Project Structure

```
Mina/
├── commands/           # Discord Slash Commands
├── data/              # Persistent storage (Memory, Logs, Settings)
├── models/            # Vosk/Whisper models
├── satellite/         # Python satellite for external integrations
├── src/
│   ├── core/          # Core logic (Voice, Memory, NLU)
│   ├── features/      # Feature modules (Gaming, Mood, Analytics, etc.)
│   ├── integrations/  # External APIs (Discord, AI, Transcription)
│   └── utils/         # Helper functions
├── index.js           # Entry point
└── deploy-commands.js # Slash command registrar
```

## Privacy & Data
Mina stores data locally in the `data/` directory.
*   **Transcripts**: Stored daily in `data/transcripts/`.
*   **Memory**: User facts and vectors stored in `data/memory.json`.
*   **Analytics**: Activity data stored in `data/activity.json`.

You can opt-out of data collection or clear your profile using the `/privacy` and `/profile` commands.

---

## Contributing
1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## License
[MIT](LICENSE)
