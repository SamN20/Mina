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
