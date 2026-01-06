# VRM Animation System

Mina can now control her VRM model with animations and expressions!

## Usage from Bot Code

Import the satellite module:
```javascript
const satellite = require('./src/integrations/satellite');
```

## Available Functions

### 1. Gestures / Animations

Play full-body animations. These correspond to FBX files in `assets/animations/`.

```javascript
satellite.playGesture(userId, gesture, duration);
```

**Common Animations:**
- `'Waving'` - Wave with right hand (friendly greeting)
- `'Joyful Jump'` - Small excited jump (celebration)
- `'Hip Hop Dancing'` - Dance move
- `'Rumba Dancing'` - Dance move
- `'Angry'` - Angry stomping/gesture
- `'Idle'` - Standard breathing idle
- `'Happy Idle'` - Happy looking idle

**Parameters:**
- `userId` - Usually `'VRM_DISPLAY'` for the main display; omit or pass `null` to broadcast to all connected satellite viewers
- `gesture` - String animation name (must match filename in `assets/animations/` without .fbx extension)
- `duration` - Animation duration in seconds (optional)

**Examples:**
```javascript
// Wave hello
satellite.playGesture('VRM_DISPLAY', 'Waving', 2.0);

// Celebrate
satellite.playGesture('VRM_DISPLAY', 'Joyful Jump', 3.0);
```

### 2. Facial Expressions

Set facial expressions (VRM BlendShapes).

```javascript
satellite.setExpression(userId, expression, intensity, duration);
```

**Available Expressions:**
- `'happy'`
- `'angry'`
- `'sad'`
- `'relaxed'`
- `'neutral'`
- `'surprised'` (if supported by model)

**Parameters:**
- `userId` - Usually `'VRM_DISPLAY'`
- `expression` - String expression name
- `intensity` - Expression intensity 0.0-1.0 (default: 0.8)
- `duration` - How long to hold (0 = indefinite)

**Examples:**
```javascript
// Show happiness
satellite.setExpression('VRM_DISPLAY', 'happy', 1.0, 2.5);

// Return to neutral
satellite.setExpression('VRM_DISPLAY', 'neutral', 0, 0);
```

### 3. Speaking / Lip Sync

Control lip sync animations (automatically triggers mouth movements based on phonemes if VibeVoice is active).

```javascript
satellite.setSpeaking(speaking);
```

**Parameters:**
- `speaking` - Boolean: `true` when Mina starts speaking, `false` when done

---

**Note:** Ensure `assets/animations/` contains the necessary FBX files for gestures.
