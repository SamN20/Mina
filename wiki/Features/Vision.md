# Vision Features

Mina's vision capabilities allow the AI to "see" and understand images from Discord and satellite clients.

## Phase 0 & 1: Discord Image Vision

### Functionality
*   **Auto-respond when mentioned + image attached**: When a user mentions Mina with an image, she automatically analyzes it and responds.
*   **Slash command `/look`**: Users can explicitly request image analysis with optional prompts and modes.
*   **DM image support**: Images sent in DMs are automatically analyzed and included in the conversation context.

### Modes
*   **`describe`**: General image captioning (default)
*   **`question`**: Q&A about specific aspects of the image
*   **`text`**: OCR - extracts visible text from images

### Implementation
*   **API**: `src/features/vision/api.js` - Handles OpenRouter vision model calls
*   **Tool**: `src/tools/vision_analyze.js` - Exposes vision analysis as a tool for the LLM
*   **Integration**: 
    *   `src/core/pipeline/handleDM.js` - DM image handling
    *   `src/features/auto_conversation/index.js` - Channel image handling
    *   `commands/look.js` - Slash command implementation

### Caching
*   Images are cached by hash (URL + prompt + mode) for 1 hour to avoid redundant API calls
*   Cache is stored in-memory and cleared on restart

## Phase 1.5: Vision Memory

### Functionality
*   **Vision summaries stored in memory**: When images are analyzed, short summaries are stored as memories tagged `vision_discord`
*   **Hash-based deduplication**: Images are hashed to prevent storing duplicate vision memories
*   **Memory format**: "Sam posted an image: [description]"

### Implementation
*   **Storage**: Vision memories are stored in `data/memory.json` with category `vision_discord`
*   **Function**: `src/core/memory/index.js::addVisionMemory()` - Adds vision memories with proper deduplication
*   **Integration**: Automatically called after image analysis in DM, auto-conversation, and `/look` command

### Memory Structure
```json
{
  "text": "Sam posted an image: a broken Gradle build log",
  "category": "vision_discord",
  "embedding": [...],
  "timestamp": 1700000000000,
  "metadata": {
    "imageHash": "abc12345",
    "source": "discord"
  }
}
```

## Phase 2: Satellite Vision MVP

### Functionality
Satellite clients can provide local computer vision capabilities without requiring LLM calls.

### Webcam Features (Local CV)
*   **Motion detection**: Detects movement in webcam feed
*   **Face presence**: Detects if faces are present in frame
*   **Person count**: Rough estimate of number of people
*   **Brightness detection**: Detects dark room conditions

### Screen Features (Local CV)
*   **Active window detection**: Identifies current application/window
*   **OCR region scan**: Extracts text from screen regions (errors/keywords)
*   **Idle detection**: Detects when user is inactive (no mouse/keyboard input)

### Implementation
*   **Server**: `src/integrations/satellite/index.js` - Handles vision events and snapshot requests
*   **Client**: `satellite/advanced/vision_client.py` - Python client implementing local CV features
*   **Capabilities**: Satellites register with `capabilities: ['vision', 'webcam_snapshot', 'screen_snapshot', 'motion_events', 'ocr_text']`

### Event Types
*   `motion_detected` - Motion detected in webcam
*   `face_status` - Face presence/absence and count
*   `brightness_status` - Room brightness level
*   `idle_status` - User idle state

### Snapshot Types
*   `webcam` - Webcam frame capture
*   `screen` - Screen screenshot

### Protocol
**Client Registration:**
```json
{
  "userId": "123456789",
  "token": "auth_token",
  "capabilities": ["vision", "webcam_snapshot", "screen_snapshot"]
}
```

**Vision Event (Client → Server):**
```json
{
  "userId": "123456789",
  "eventType": "motion_detected",
  "eventData": {
    "motionPixels": 5000,
    "timestamp": 1700000000
  }
}
```

**Snapshot Request (Server → Client):**
```json
{
  "requestId": "uuid",
  "snapshotType": "webcam"
}
```

**Snapshot Response (Client → Server):**
```json
{
  "requestId": "uuid",
  "snapshotType": "webcam" | "screen",
  "imageData": "base64_encoded_image",
  "ocrText": "extracted_text_optional",
  "error": "error_message_optional"
}
```

### Logging
Vision events are logged to `data/logs/vision.log` instead of `bot.log` to keep vision-specific logs separate.

## Phase 3: On-demand Eyes

### Functionality
Mina can request snapshots on command from connected vision satellites and analyze them using OpenRouter vision models.

### Voice Commands
*   **"Mina, what am I looking at?"** → Webcam snapshot → Vision analysis → Response
*   **"Mina, what's on my screen?"** → Screen snapshot → OCR first, then vision analysis → Response
*   **"Mina, read this error"** / **"Mina, read my screen"** → Screen snapshot → OCR text extraction → Response

### Features
*   **On-demand snapshots**: Server requests snapshots from vision satellite clients only when explicitly requested
*   **OCR integration**: Automatic text extraction from screen captures using pytesseract
*   **Smart OCR handling**: For large amounts of text, extracts error messages or summarizes key information
*   **Settings-based control**: Users can enable/disable on-demand snapshots via GUI settings

### Implementation
*   **Commands**: `src/features/vision/commands.js` - Voice command handlers registered in command registry
*   **OCR**: `satellite/advanced/vision_client.py` - Uses pytesseract for text extraction
*   **Integration**: Commands are checked before intent-based matchers to ensure proper matching
*   **Settings**: `satellite/advanced/vision_settings.py` - JSON-based configuration

### Command Patterns
**Webcam Commands:**
*   "what am i looking at"
*   "what am i seeing"
*   "what's in front of me"
*   "look at me"
*   "describe what's in front of me"

**Screen Commands:**
*   "what's on my screen"
*   "what is on my screen"
*   "what's showing on my screen"
*   "describe my screen"
*   "what do you see on my screen"

**OCR Commands:**
*   "read this error"
*   "read the error"
*   "read my screen"
*   "read the text on my screen"
*   "what error am i getting"

### Settings & Configuration
Vision features can be configured via the GUI settings panel:

**Feature Toggles:**
*   Motion detection (enable/disable)
*   Face detection (enable/disable)
*   Brightness detection (enable/disable)
*   Idle detection (enable/disable)
*   On-demand snapshots (enable/disable, with webcam/screen sub-options)

**Rate Limits:**
*   Configurable rate limits (in seconds) for each feature to control event frequency
*   Motion detection: Default 2.0s
*   Face detection: Default 2.0s
*   Brightness detection: Default 1.0s
*   Idle detection: Default 10.0s

**Thresholds:**
*   Motion threshold (pixels): Default 5000
*   Dark threshold: Default 50
*   Brightness change threshold: Default 10
*   Idle threshold (seconds): Default 300 (5 minutes)

Settings are saved to `satellite/config/vision_settings.json` and persist across restarts.

### OCR Improvements
*   **Error extraction**: Automatically detects and extracts error messages from OCR text
*   **Long text handling**: For screens with lots of text, focuses on first/last lines or error patterns
*   **Pattern matching**: Looks for common error indicators (error:, exception:, failed:, warning:)
*   **Summarization**: Falls back to vision API for summarization when OCR text is too long

### Protocol Updates
**Snapshot Request (Server → Client):**
```json
{
  "requestId": "uuid",
  "snapshotType": "webcam" | "screen",
  "includeOCR": true | false
}
```

**Snapshot Response (Client → Server):**
```json
{
  "requestId": "uuid",
  "snapshotType": "webcam" | "screen",
  "imageData": "base64_encoded_image",
  "ocrText": "extracted_text_optional",
  "error": "error_message_optional"
}
```

### Gating Rules
*   Snapshots are **only** sent when:
    *   User explicitly requests via voice command
    *   Or an event triggers (if that mode is enabled in settings)
*   Settings validation: On-demand snapshots respect user preferences (can be disabled per feature)
*   Privacy: Users have full control over what vision features are active

## Future Phases

### Phase 4: Local Object Detection
*   Object detection (phone, cup, controller, pets)
*   Pose/posture detection
*   Hand gesture recognition
*   Event-based reactions

### Phase 5: Clips & Ring Buffer
*   Rolling buffer of last 10-20 seconds
*   Export clips on command or event

### Phase 6: Visual Memory
*   Scene recognition
*   Optional face recognition (opt-in only)

### Phase 7: Multi-source Context Fusion
*   Combine text + voice + vision + events for richer context
