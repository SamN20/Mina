# Feature Implementation

This document provides a technical analysis of the functional modules within `src/features`.

## 1. Gaming Integration (`src/features/gaming`)

The Gaming feature maintains a real-time registry of user activities and leverages this data for social features.

### Functionality
*   **Presence Tracking**: Monitors the Discord `PresenceUpdate` event stream. When a user launches a game, the activity is logged.
*   **Squad Finder**: Users can query the system ("Who plays X?") to retrieve a list of users known to own or play a specific title.
*   **Recommendation Engine**: The "What can we play?" command analyzes the active voice channel members, retrieves their gaming history, and computes an intersection set of common games, ranked by aggregate play frequency.

### Implementation Details
*   **Storage**: `data/gaming.json` (Structured JSON).
*   **Logic**: `gaming/store.js` handles data persistence; `gaming/index.js` handles NLU queries.

## 2. Memory System (`src/core/memory`)

The Memory system serves as the persistence layer for user profiling and context retention.

### Functionality
*   **Fact Extraction**: The system analyzes conversation history to extract persistent facts (e.g., "User A lives in New York").
*   **Vector Search**: Facts are embedded using a local model and stored with a vector key. During conversation generation, the user's query is embedded, and the memory database is queried for semantically relevant entries (Cosine Similarity > 0.25).
*   **Context Injection**: Retrieved memories are injected into the LLM system prompt to provide continuity.

## 3. Mood and Personality (`src/features/mood`)

The Mood system implements a dynamic emotional state machine that influences response generation.

### Functionality
*   **Tilt State**: A numerical value (0-100) representing frustration.
    *   **Triggers**: Repeated errors, rude language, or explicit "TILT" actions from the NLU.
    *   **Effects**: Higher tilt results in shorter, more sarcastic LLM system prompts.
    *   **Thresholds**: At 100% tilt, the `shouldLeave` flag is set to `true`, triggering a disconnection event.
*   **Reactions**: The system can asynchronously react to text messages with emojis based on sentiment analysis.

## 4. Satellite Media Control (`src/features/music`)

The Media module delegates playback control to the external Satellite client.

### Functionality
*   **Command Delegation**: NLU intents (Play, Pause, Next) are not executed locally. Instead, they are serialized into a JSON command payload.
*   **Broadcasting**: The payload is broadcast via `src/integrations/satellite` to the connected WebSocket client.
*   **Hardware Abstraction**: The specific implementation of "Play" (Spotify vs. YouTube) is abstracted to the client-side Python logic.

## 5. Autonomous Conversation (`src/features/auto_conversation`)

This module enables the system to initiate or join conversations without explicit invocation.

### Functionality
*   **Activity Monitoring**: The system buffers recent transcripts from all users.
*   **Opportunity Detection**: Periodically, the buffer is analyzed by an LLM to determine if the bot has relevant input.
*   **Thresholding**: A "Trigger Confidence" score (0.0 - 1.0) is computed. If the score exceeds the configurable threshold (default `0.6`), a response is generated.

## 6. Reminder System (`src/features/reminders`)

A robust scheduling system for deferred actions.

### Usage
*   **Time-Based**: "Remind me to X in 10 minutes."
*   **Event-Based**: "Remind me to X when I join voice."

### Implementation
*   **Persistence**: Reminders are serialized to disk to survive application restarts.
*   **Scheduler**: A background interval checks for expired time-based reminders.
*   **Event Hooks**: The Voice State Update handler checks for pending event-based reminders upon user connection.

## 7. Analytics (`src/features/analytics`)

A background telemetry module.

### Functionality
*   **Heatmapping**: Tracks voice activity density by hour of day and day of week.
*   **Social Graph**: Increments edge weights between users who are in the voice channel simultaneously, allowing for cluster analysis ("Squads").

## 8. Greetings (`src/features/greetings`)

Handles user entry and exit events to provide a welcoming experience.

### Functionality
*   **New User Greeting**: Detects first-time connections to the voice channel. The system generates a personalized welcome message using facts from memory.
*   **Group Greeting**: When the bot joins an occupied channel, it assesses the group composition and generates a context-aware "Hello everyone" message, optionally highlighting key individuals.
*   **Consent Warning**: **Mandatory feature**. Every greeting includes a disclaimer that "Voice transcription is active" to comply with privacy expectations.

## 9. Soundboard (`src/features/soundboard`)

Allows playback of short audio clips interleaved with speech.

### Functionality
*   **Audio Mixing**: The system can parse response text for `[sound:name]` tags.
*   **Sequence Generation**: It constructs an `AUDIO_SEQUENCE` action, seamlessly queueing TTS segments and sound files (e.g., "[TTS] Here is a drumroll... [Sound] drumroll.mp3 [TTS] Tada!").

## 10. Weather (`src/features/weather`)

Provides real-time meteorological data.

### Functionality
*   **Integration**: Connects to external weather APIs.
*   **Context**: Can resolve queries like "What's the weather?" by using the user's stored location (if known) or asking for clarification.

## 11. Fun & Games (`src/features/fun`, `src/features/gaming`)

Miscellaneous entertainment modules.

*   **Minigames**: Logic for simple interactive games (Trivia, etc.).
*   **User Interaction**: Responds to "Tell me a joke" or "Roast me" requests, utilizing the Persona/Mood system to tailor the delivery.

## 12. Wrapped (`src/features/wrapped`)

Annual or on-demand summary generation.

*   **Aggregation**: Compiles data from `data/activity.json` and `data/memory.json`.
*   **Report Generation**: Produces a narrative summary of the user's "Year in Review," highlighting most played games, top friends, and total talk time.

## 13. Notes (`src/features/notes`)

A personal notebook system.

### Functionality
*   **Storage**: Persists user notes to `data/notes.json` by User ID.
*   **Access**: Notes can be added, listed, or deleted via Slash Commands (`/note`) or Voice Commands ("Make a note...").
*   **AI Integration**: The LLM can manage notes autonomously (e.g. "Write down that I need milk") via the `manage_notes` tool.


## 14. Do Not Disturb (`src/features/dnd`)

Allows distinct marking of voice channels as busy.

### Functionality
*   **Toggle**: User can add `[DND]` to channel name via voice.
*   **Auto-Cleanup**: The tag is automatically removed when the enabling user leaves the channel.

## 15. Vision (`src/features/vision`)

Enables Mina to "see" and understand images from Discord and satellite clients.

### Functionality
*   **Discord Image Analysis**: Automatically analyzes images posted in Discord channels or DMs
*   **Slash Command `/look`**: Explicit image analysis with customizable prompts and modes
*   **Vision Memory**: Stores short summaries of analyzed images in memory (Phase 1.5)
*   **Satellite Vision**: Local computer vision via satellite clients (Phase 2)
    *   Motion detection
    *   Face presence/absence
    *   Brightness detection
    *   Idle detection
    *   Screen capture and OCR
*   **On-demand Vision**: Voice commands to request snapshots and analysis (Phase 3)
    *   "What am I looking at?" - Webcam analysis
    *   "What's on my screen?" - Screen analysis with OCR
    *   "Read this error" - OCR text extraction
*   **GUI Settings**: Configurable feature toggles, rate limits, and thresholds

### Implementation
*   **API**: `src/features/vision/api.js` - OpenRouter vision model integration
*   **Tool**: `src/tools/vision_analyze.js` - LLM tool for image analysis
*   **Commands**: `src/features/vision/commands.js` - Voice command handlers (Phase 3)
*   **Memory**: `src/core/memory/index.js::addVisionMemory()` - Vision memory storage
*   **Satellite**: `src/integrations/satellite/index.js` - Vision event handling
*   **Client**: `satellite/advanced/vision_client.py` - Python vision satellite client
*   **Settings**: `satellite/advanced/vision_settings.py` - Configuration management (Phase 3)
*   **GUI**: `satellite/advanced/vision_settings_gui.py` - Settings interface (Phase 3)

For detailed documentation, see [[Vision Features|Features/Vision]].
