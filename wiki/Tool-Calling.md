# Tool Calling

This document explains the Tool Calling infrastructure, which allows the AI to execute server-side functions.

## Overview

Tool Calling allows the bot to perform actions that are beyond simple text generation, such as:
*   Fetching real-time data (Weather, News).
*   Interacting with system APIs (Database, Home Automation).
*   Performing complex calculations.

The system is designed to be **modular**. You can add new tools by simply dropping a `.js` file into `src/tools/`.

## When to use Tools vs Tags

| Feature | Use **Tags** `[action]` | Use **Tool Calls** |
| :--- | :--- | :--- |
| **Logic** | Simple, Client-side (Frontend/TTS) | Complex, Server-side |
| **Data** | Static or Pre-loaded | Dynamic / API Fetched |
| **Speed** | Instant | Requires API Round-trip |
| **Examples** | Changing facial expressions `[tilt:10]` | Searching Google |
| | Playing sound effects `[sound:boom]` | checking Database stats |
| | Sending DMs `[dm:User:Msg]` | calculating math |

## Adding a New Tool

1.  Create a new file in `src/tools/`, e.g., `src/tools/weather.js`.
2.  Export a module with `definition` and `execute`.

### Example Template

```javascript
module.exports = {
  // 1. Define the interface for the AI
  definition: {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { 
            type: "string", 
            description: "City and Province, e.g. Toronto, ON" 
          }
        },
        required: ["location"]
      }
    }
  },

  // 2. Define the execution logic
  execute: async ({ location }) => {
    // Perform API call or logic here
    const temp = 72; 
    return `The weather in ${location} is ${temp}°C.`;
  }
};
```

## Architecture

*   **Registry**: `src/core/ai/toolRegistry.js` loads all tools at startup.
*   **Execution**:
    1.  AI Model requests a tool call.
    2.  System intercepts the request.
    3.  `toolRegistry` executes the function.
    4.  Result is fed back to the AI.
    5.  AI generates the final response using the data.
*   **Parallelism**: The system supports executing multiple tools simultaneously to save time and API tokens.
+
+## Reliability Layer
+
+To handle unreliable model behavior (where the model might "think" about using a tool but fail to call it), Mina uses a layered reliability system:
+
+1.  **Trigger Keyword Match (Hinting)**:
+    The system scans the user's raw message for keywords (e.g., "weather", "remind me", "look up"). If a match is found, it injects a `[TOOL HINT]` into the system prompt, specifically instructing the model that it **MUST** use that tool.
+
+2.  **Detection + Retry**:
+    If a model's response mentions a tool name in it's thought tags or text (e.g., "I should use the weather tool") but doesn't actually emit a `tool_calls` payload, the system catches this. It then provides a feedback nudge: *"You mentioned using the tool but didn't call it. Please call the tool now."* and retries the request.
+
+3.  **Action Claim Detection**:
+    The system also detects common phrases where the model falsely claims an action was performed without a tool call (e.g., "I've added the note"). These also trigger the retry mechanism.
