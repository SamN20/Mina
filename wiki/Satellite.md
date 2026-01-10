# Satellite Client Protocol

The Satellite Client is a peripheral application designed to extend the system's capabilities beyond the sandboxed Discord environment. It runs on a local host machine to execute system-level operations such as media control and hardware monitoring.

## Protocol Overview

Communication between the Mina server and the Satellite client occurs via WebSocket using the `socket.io` protocol.

*   **Transport**: WebSocket (wss/ws)
*   **Auth**: Token-based authentication handshake.

### Payload Structure

**Server to Client (Command)**
```json
{
  "event": "command",
  "data": {
    "type": "media_control", 
    "action": "next",
    "timestamp": 1700000000
  }
}
```

**Client to Server (Telemetry)**
```json
{
  "event": "status",
  "data": {
    "playback": {
      "state": "playing",
      "track": "Song Title",
      "artist": "Artist Name"
    },
    "hardware": {
      "cpu_load": 15
    }
  }
}
```

## Client Architecture

The client is implemented in Python and consists of the following subsystems:
1.  **Network Layer**: `socket.io-client` handles persistent connection and reconnection logic.
2.  **Input Simulation**: `pyautogui` / `pynput` executes virtual keystrokes for media control.
3.  **Visual Layer**: An embedded web view renders the VRM avatar for visual feedback.

## Deployment

Refer to the project `README.md` in the `satellite/` directory for installation instructions.
