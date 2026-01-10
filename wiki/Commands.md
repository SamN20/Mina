# Command Reference

The system supports interactions via both Slash Commands (text-based) and Voice Directives (speech-based).

## Slash Commands

Slash commands are executed within the Discord text interface. They require appropriate permissions as configured in the Discord Server Settings.

### General Interaction

| Command | Description | Permission |
| :--- | :--- | :--- |
| `/join` | Connects the bot to the user's current voice channel. | Everyone |
| `/leave` | Disconnects the bot from the voice channel. | Everyone |
| `/say` | Synthesizes speech from text input. | Everyone |
| `/stoptts` | Aborts the current audio playback sequence. | Everyone |
| `/animate` | Triggers a VRM animation sequence. | Everyone |
| `/joinsound` | Sets the custom audio file for user entry events. | Everyone |
| `/leavesound` | Sets the custom audio file for user exit events. | Everyone |

### Data & Configuration

| Command | Description | Permission |
| :--- | :--- | :--- |
| `/profile` | Retrieves or clears stored user data. | Everyone |
| `/reminders` | Displays the reminder management dashboard. | Everyone |
| `/download` | Exports the daily transcription log. | Everyone |
| `/privacy` | Manages data retention policies. | Everyone |
| `/toggleai` | Global switch for AI response generation. | Everyone |

### Administration

| Command | Description | Permission |
| :--- | :--- | :--- |
| `/manage_commands` | Toggles availability of specific voice modules. | Admin |
| `/toggle_auto` | Configures Autonomous Conversation mode. | Admin |
| `/setvoice` | Updates the default Text-to-Speech voice identifier. | Admin |
| `/setmodel` | Selects the active Language Model configuration. | Admin |
| `/setpfp` | Updates the bot's visual avatar. | Admin |
| `/setglobalvoice` | Establishes the default voice for all users. | Admin |
| `/toggledebug` | Enables verbose logging output to the text channel. | Admin |
| `/toggleghost` | Toggles "Ghost Mode" (suppresses join/leave announcements). | Admin |

## Voice Directives

Voice directives are natural language phrases processed by the NLU system. They typically require the wake word ("Mina" or "Nina") unless Autonomous Mode is active.

### Utilities
*   **Termination**: "Stop" / "Shut up"
*   **Scheduling**: "Remind me to [Task] in [Time]"
*   **Status**: "What time is it?", "What is the weather in [Location]?"

### Interactions
*   **Query**: "Who plays [Game]?" (Retrieves user list from memory)
*   **Recommendation**: "What can we play?" (Analyzes overlapping game libraries)
*   **Conversation**: General inquiries are routed to the LLM for context-aware responses.

### Media Control
*Requires Satellite Client connection.*
*   **Playback**: "Play [Title]"
*   **Flow**: "Pause", "Resume", "Next", "Previous"
