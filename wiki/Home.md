# Documentation

Mina is an advanced context-aware AI assistant designed for integration with Discord voice channels. This system utilizes Large Language Models (LLMs) and local speech processing to provide natural language interaction, persistent state management, and real-time responsiveness.

This documentation serves as the primary reference for the architecture, deployment, and usage of the Mina project.

## Table of Contents

### User Guide
*   **[[Getting Started]]**: Installation, configuration, and first steps.
*   **[[Feature Guide|Features]]**: Detailed breakdown of modules (Gaming, Music, Reminders, etc.).
*   **[[Command Reference|Commands]]**: List of all Slash Commands (`/`) and Voice Directives.

### Developer Documentation
*   **[[Architecture]]**: Technical overview of the core pipeline, NLU system, and operational logic.
*   **[[Voice Pipeline]]**: End-to-end data flow analysis of audio ingestion, transcription, and output.
*   **[[Auto Conversation]]**: Logic behind passive voice and text participation.
*   **[[Memory System]]**: Deep dive into vector embeddings and the learning loop.
*   **[[Tool Calling]]**: How to add new tools and execute them.
*   **[[Development]]**: Guidelines for contributing code, adding features, and testing.
*   **[[Database Schema|Database]]**: Structure of the local file-based storage systems (Memory, Analytics).
*   **[[Satellite Client|Satellite]]**: Protocol and usage for the external Python desktop client.
*   **[[Deployment]]**: Running Mina as a Systemd service.

## Project Structure
The repository is organized as follows:
*   `src/core`: Fundamental system logic (Pipeline, NLU, Memory).
*   `src/features`: Modular capability implementations.
*   `src/integrations`: Connectors for external services (Discord, OpenAI, Vosk).
*   `commands`: Discord interaction entry points.
*   `satellite`: External desktop client code.

## License
This software is distributed under the MIT License.
