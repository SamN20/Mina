# Testing Mina Vision Satellite Client

This guide explains how to test the vision client **without making LLM calls** to verify everything is working correctly.

## Prerequisites

1. **Install Vision Client**: Run `Install Vision.bat` to set up dependencies
2. **Configure**: Run `Start Vision.bat` and complete the setup wizard
3. **Server Running**: Ensure your Mina server is running and accessible

## Testing Without LLM Calls

The vision client operates in **Phase 2 mode** - it only sends **events** to the server, not images. This means:

- ✅ **No LLM calls** - Events are just logged on the server
- ✅ **No API costs** - Everything is local computer vision
- ✅ **Privacy safe** - Only event data (motion detected, face count, etc.) is sent

## What Gets Sent

The vision client sends these **event types** (not images):

1. **`motion_detected`** - When motion is detected in webcam
   ```json
   {
     "eventType": "motion_detected",
     "eventData": {
       "motionPixels": 5000,
       "timestamp": 1700000000
     }
   }
   ```

2. **`face_status`** - Face presence/absence updates
   ```json
   {
     "eventType": "face_status",
     "eventData": {
       "hasFace": true,
       "faceCount": 1,
       "timestamp": 1700000000
     }
   }
   ```

3. **`brightness_status`** - Room brightness level
   ```json
   {
     "eventType": "brightness_status",
     "eventData": {
       "brightness": 120.5,
       "isDark": false,
       "timestamp": 1700000000
     }
   }
   ```

4. **`idle_status`** - User idle state
   ```json
   {
     "eventType": "idle_status",
     "eventData": {
       "isIdle": false,
       "idleDuration": 45.2,
       "timestamp": 1700000000
     }
   }
   ```

## Testing Steps

### 1. Start the Vision Client

```bash
# Double-click "Start Vision.bat" or run:
cd satellite
Start Vision.bat
```

### 2. Check Server Logs

Watch your Mina server console for vision events:

```bash
# You should see logs like:
[Satellite Vision] Event from 123456789: motion_detected
[Satellite Vision] Event from 123456789: face_status
[Satellite Vision] Event from 123456789: brightness_status
```

### 3. Test Motion Detection

- **Wave your hand** in front of the webcam
- Check server logs for `motion_detected` events
- Events are throttled to max 1 per 2 seconds

### 4. Test Face Detection

- **Sit in front of webcam** - should detect face
- **Move away** - should report no face
- Check server logs for `face_status` events

### 5. Test Brightness Detection

- **Cover webcam** - should detect dark room
- **Uncover webcam** - should detect normal brightness
- Check server logs for `brightness_status` events

### 6. Test Idle Detection

- **Stop moving mouse/keyboard** for 5+ minutes
- Check server logs for `idle_status` events with `isIdle: true`

### 7. Test Snapshot Request (Optional)

The server can request snapshots, but they're only sent when explicitly requested:

```javascript
// On server side (for testing):
const satellite = require('./src/integrations/satellite');
const snapshot = await satellite.requestVisionSnapshot(userId, 'webcam');
// This will return base64 image data, but only when requested
```

## Verifying Everything Works

### ✅ Success Indicators

1. **Client GUI shows "Connected"** (green status)
2. **Server logs show vision events** being received
3. **No errors** in client or server logs
4. **Events appear** when you move/wave in front of camera

### ❌ Common Issues

**"Webcam not available"**
- Check camera permissions in Windows Settings
- Ensure no other app is using the camera
- Try restarting the client

**"Connection failed"**
- Verify server URL is correct (should start with `ws://` or `wss://`)
- Check server is running and accessible
- Verify token is correct

**"No events appearing"**
- Check webcam is working (try Windows Camera app)
- Ensure you're moving/waving in front of camera
- Check client logs for errors

**"Face detection not working"**
- MediaPipe may need to download models on first run (check internet connection)
- OpenCV fallback should still work if MediaPipe fails

## Testing Snapshot Functionality

To test snapshot requests **without LLM calls**, you can manually trigger them:

### Server-Side Test Script

Create a test file `test_vision_snapshot.js`:

```javascript
const satellite = require('./src/integrations/satellite');

async function testSnapshot() {
    const userId = 'YOUR_USER_ID';
    
    console.log('Requesting webcam snapshot...');
    const result = await satellite.requestVisionSnapshot(userId, 'webcam');
    
    if (result && result.imageData) {
        console.log('✅ Snapshot received!');
        console.log(`Image data length: ${result.imageData.length} characters`);
        // You can decode and save if needed:
        // const fs = require('fs');
        // const buffer = Buffer.from(result.imageData, 'base64');
        // fs.writeFileSync('test_snapshot.jpg', buffer);
    } else {
        console.log('❌ No snapshot received');
    }
}

testSnapshot();
```

Run with: `node test_vision_snapshot.js`

## Next Steps (Phase 3+)

Once Phase 2 is verified working, Phase 3 will add:
- On-demand vision analysis ("Mina, what am I looking at?")
- Integration with Mina's conversation pipeline
- LLM vision calls only when explicitly requested

For now, Phase 2 is **completely LLM-free** and safe to test!
