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

## Capability Registration

Satellites can register with specific capabilities:

**Media Satellite:**
```json
{
  "userId": "123456789",
  "token": "auth_token",
  "capabilities": ["media"]
}
```

**Vision Satellite (Phase 2):**
```json
{
  "userId": "123456789",
  "token": "auth_token",
  "capabilities": ["vision", "webcam_snapshot", "screen_snapshot", "motion_events", "ocr_text"]
}
```

## Vision Events (Phase 2)

Satellites with vision capabilities can send events:

**Motion Detection:**
```json
{
  "event": "vision_event",
  "data": {
    "userId": "123456789",
    "eventType": "motion_detected",
    "eventData": {
      "motionPixels": 5000,
      "timestamp": 1700000000
    }
  }
}
```

**Face Status:**
```json
{
  "event": "vision_event",
  "data": {
    "userId": "123456789",
    "eventType": "face_status",
    "eventData": {
      "hasFace": true,
      "faceCount": 1,
      "timestamp": 1700000000
    }
  }
}
```

**Snapshot Request (Phase 3):**
```json
{
  "event": "vision_snapshot_request",
  "data": {
    "requestId": "uuid",
    "snapshotType": "webcam" | "screen",
    "includeOCR": true | false
  }
}
```

**Snapshot Response (Phase 3):**
```json
{
  "event": "vision_snapshot_response",
  "data": {
    "requestId": "uuid",
    "snapshotType": "webcam" | "screen",
    "imageData": "base64_encoded_image",
    "ocrText": "extracted_text_optional",
    "error": "error_message_optional"
  }
}
```

## Vision Settings (Phase 3)

Vision satellite clients support configurable settings via GUI:

*   **Feature toggles**: Enable/disable individual vision features
*   **Rate limits**: Control how often events are sent (in seconds)
*   **Thresholds**: Adjust detection sensitivity
*   **On-demand controls**: Control whether snapshots can be requested

Settings are stored in `satellite/config/vision_settings.json` and loaded on client startup.

## Deployment

Refer to the project `README.md` in the `satellite/` directory for installation instructions.

For vision capabilities, see `satellite/advanced/vision_client.py` and the [[Vision Features|Features/Vision]] documentation.
