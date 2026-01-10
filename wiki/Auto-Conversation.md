# Auto-Conversation System

The Auto-Conversation module (`src/features/auto_conversation`) enables Mina to participate in conversations passively, without requiring a wake word or explicit mention. It operates in both Voice and Text contexts.

## Architecture

The core of the system is the **Conversation Buffer** and the **Opportunity Evaluator**.

### The Buffer
The system maintains a rolling buffer of conversation history for each active context (Guild ID or Channel ID).
*   **Capacity**: 15 lines.
*   **Window**: 5 minutes (Older messages are discarded).
*   **Content**: Stores the text, username, and timestamp of every user utterance or message.

### evaluation Logic
Every time a new message enters the buffer, the system evaluates whether to "Chime In".

1.  **Gating Filtering**:
    *   **Length**: Very short messages (< 5 characters) are ignored unless they are a direct mention.
    *   **Activity**: Requires a minimum of **4 lines** in the buffer to establish context.

2.  **Probability Check**:
    If the gateway checks pass, a random roll determines if the request proceeds to the LLM.
    *   **Targeted (100%)**: Text contains "Mina", "Bot", "AI".
    *   **Hot Thread (60%)**: A conversation where Mina has recently spoken (within 2 minutes).
    *   **Normal (30%)**: Standard idle conversation.

## Operation Modes

### Voice Mode
*   **Input**: Finalized transcripts from the Voice Pipeline.
*   **Output**: TTS logic (`audio.speak`).
*   **Protection**: Disables "Hot Thread" probability to prevent the bot from dominating voice conversations (Anti-interrupt logic).

### Text Mode
*   **Input**: `messageCreate` events from Discord text channels.
*   **Output**: Standard text replies.
*   **Rate Limiting**: Checks against a daily usage quota to prevent excessive API costs or spam.
*   **Indicators**: Triggers "Typing..." status before responding.

## Configuration

Administrators can manage this feature via the `/toggle_auto` command.

| Setting | Description |
| :--- | :--- |
| **Voice Enabled** | Allows the bot to speak without a wake word. |
| **Text Enabled** | Allows the bot to reply to text messages in allowed channels. |

## Feature Interactions
*   **Direct Mentions**: Bypasses all probability checks and buffers constraints (Always replies).
*   **Ghost Mode**: Auto-conversation is suppressed when Ghost Mode is active to maintain stealth.
*   **Mood**: The bot's current "Tilt" level acts as input to the system prompt, influencing whether the unprompted response is helpful, annoyed, or silent.
