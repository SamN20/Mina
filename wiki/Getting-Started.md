# Getting Started

This guide outlines the prerequisites and steps required to deploy the Mina system.

## Prerequisites

The following software must be installed on the host system:

*   **Node.js**: Version 18 or higher (LTS recommended).
*   **Python**: Version 3.8 or higher (required for transcription services and Satellite client).
*   **FFmpeg**: Required for audio processing and stream handling.

Additionally, the following credentials are required:
*   **Discord Bot Token**: Obtained from the Discord Developer Portal.
*   **LLM API Key**: A valid key from OpenRouter or a compatible Gemini API provider.

## Installation

### 1. Repository Setup

Clone the repository to the local environment:

```bash
git clone https://github.com/SamN20/Mina.git
cd Mina
```

### 2. Dependency Installation

Execute the provided setup script to clean the environment and install necessary Node.js and Python dependencies. This script creates a virtual environment for Python to isolate transcription libraries.

```bash
npm install
node setup.js
```

The setup script performs the following actions:
1.  Installs Node.js packages as defined in `package.json`.
2.  Creates a Python virtual environment in `venv/`.
3.  Installs Python dependencies (e.g., `vosk`, `sounddevice`).
4.  Downloads the Vosk speech recognition model (`vosk-model-small-en-us-0.15`) into the `models/` directory.

## Configuration

### Environment Variables

A `.env` file is required in the project root. A template is provided in `.env.example`.

```bash
cp .env.example .env
```

Define the following variables in the `.env` file:

| Variable | Description |
| :--- | :--- |
| `DISCORD_TOKEN` | The bot token from Discord Developer Portal. |
| `CLIENT_ID` | The Application ID of the bot. |
| `GUILD_ID` | (Optional) The Server ID for rapid command deployment during development. |
| `OPENROUTER_API_KEY` | The API key for the LLM provider. |

### General Configuration

Runtime settings such as wake words and voice preferences are stored in `data/settings.json`. This file is generated with default values upon the first execution of the application.

## Execution

To start the application process:

```bash
node index.js
```

### Background Service
For production environments, it is recommended to manage the application as a system service. Refer to the **[[Deployment]]** guide for instructions on configuring systemd or other process managers.

## Troubleshooting

### Module Not Found (Vosk)
Ensure the application is executed via `node index.js`. The application internally manages the Python virtual environment path. Manual execution of Python scripts requires activation of the `venv`.

### Audio/FFmpeg Errors
Verify that FFmpeg is strictly installed and accessible in the system PATH.
