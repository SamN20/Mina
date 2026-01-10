# Development Guide

This document provides guidelines for extending and maintaining the Mina codebase.

## Codebase Organization

The project adheres to a separation of concerns pattern:

```
src/
├── core/          # System Framework (Pipeline, NLU, Memory)
├── features/      # Domain Logic (Gaming, Music)
├── integrations/  # Adapters (Discord API, LLM Providers)
└── utils/         # Shared Utilities
```

## Feature Implementation

New capabilities should be implemented as self-contained modules within `src/features`.

### Step 1: Module Creation
Create a directory `src/features/<feature_name>` containing an `index.js`. The module must export an execution function that accepts the input text and context, returning an `ActionPlan`.

```javascript
// src/features/example/index.js
const { ActionType } = require('../../core/types');

async function execute(text, context) {
    // Logic implementation
    return {
        [ActionType.TTS_SPEAK]: "Operation successful."
    };
}

module.exports = { execute };
```

### Step 2: Intent Registration
Modify `src/core/nlu/classifier.js` to include the detection logic for the new feature. This typically involves updating the keyword matching algorithm or training data.

### Step 3: Pipeline Integration
Update the router in `src/core/pipeline/handleUtterance.js` to dispatch the identified intent to the new feature module.

## Standards and Practices

*   **Asynchronous Patterns**: Utilize `async/await` for all I/O operations.
*   **Path Handling**: Use the `path` module for file system operations to ensure cross-platform compatibility.
*   **Logging**: Use `console.log` (stdout) for operational events and `console.error` (stderr) for exceptions.
*   **Type Safety**: While JavaScript is loosely typed, ensure object structures (like `ActionPlan`) strictly adhere to defined contracts.

## AI Implementation Context

This section provides context for AI agents working on this codebase.

### The ActionPlan Pattern
The system uses a **Command Pattern** implementation. Features **MUST** return a plan, not execute side effects.

**Valid Action Types (`src/core/types.js`):**
*   `TTS_SPEAK`: Simple speech output.
*   `PLAY_FILE`: Audio file playback.
*   `AUDIO_SEQUENCE`: Mixed TTS and Audio.
*   `SATELLITE_CMD`: Delegate handling to external client (Media controls).
*   `REMINDER_SET`: Schedule valid reminder.
*   `TIMER_SET`: Schedule short-term timer.
*   `LEAVE`: Disconnect voice.
*   `SEND_DM`: Send private message to user.

### Key Dependencies
*   **`fs` vs `storage`**: Use `src/core/storage` wrappers when available for standardized error handling.
*   **`path.join`**: Mandatory for specific file paths.
*   **`vector.js`**: Use `src/core/memory/vector.js` for embedding operations. Do not import `transformers` directly in features.

