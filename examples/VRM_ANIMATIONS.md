# VRM Animation System

Mina can now control her VRM model with a rich set of animations, gestures, and expressions!

## Overview

The VRM animation system allows Mina to:
- Express emotions through facial expressions
- Perform natural gestures (wave, nod, point, etc.)
- Display body language (lean forward when interested, cross arms, etc.)
- React with emotes (laugh, surprised, confused, etc.)
- Control lip sync when speaking

## Usage from Bot Code

Import the satellite module:
```javascript
const satellite = require('./src/integrations/satellite');
```

## Available Functions

### 1. Gestures

Play gesture animations that involve body and arm movements:

```javascript
satellite.playGesture(userId, gesture, duration);
```

**Available Gestures:**
- `'Waving'` - Wave with right hand (friendly greeting)
- `'Joyful Jump'` - Small excited jump (celebration)
- `'Hip Hop Dancing'` - Dance move
- `'Rumba Dancing'` - Dance move

**Parameters:**
- `userId` - Usually `'VRM_DISPLAY'` for the main display; omit or pass `null` to broadcast to all connected satellite viewers
- `gesture` - String gesture name (must match filename in `assets/animations/`)
- `duration` - Animation duration in seconds (default: 2.0)

**Examples:**
```javascript
// Wave hello
satellite.playGesture('VRM_DISPLAY', 'Waving', 2.0);

// Celebrate
satellite.playGesture('VRM_DISPLAY', 'Joyful Jump', 3.0);
```

### 2. Emotes / Expressions

Play emotional animations or set facial expressions:

```javascript
satellite.setExpression(userId, expression, intensity, duration);
```

**Available Expressions:**
- `'happy'`
- `'angry'`
- `'sad'`
- `'relaxed'`
- `'neutral'`
- `'blink'`
- `'surprised'` (if supported by model)

**Examples:**
```javascript
// Show happiness
satellite.setExpression('VRM_DISPLAY', 'happy', 1.0, 2.5);

// Show anger
satellite.setExpression('VRM_DISPLAY', 'angry', 0.8, 2.0);
```
- `'sad'` - Sad face
- `'surprised'` - Wide eyes, open mouth
- `'relaxed'` - Calm, neutral-positive
- `'neutral'` - Default expression

**Parameters:**
- `userId` - Usually `'VRM_DISPLAY'`; omit or pass `null` to broadcast to all connected satellite viewers
- `expression` - String expression name
- `intensity` - Expression intensity 0.0-1.0 (default: 0.8)
- `duration` - How long to hold (0 = indefinite, default: 0)

**Examples:**
```javascript
// Show happiness
satellite.setExpression('VRM_DISPLAY', 'happy', 0.8, 0);

// Brief surprised look
satellite.setExpression('VRM_DISPLAY', 'surprised', 1.0, 1.5);

// Return to neutral
satellite.setExpression('VRM_DISPLAY', 'neutral', 0.5, 0);
```

### 4. Body Language / Poses

Play body language animations that convey attitudes:

```javascript
satellite.playPose(userId, pose, duration);
```

**Available Poses:**
- `'lean_forward'` - Lean forward (interested, engaged)
- `'lean_back'` - Lean back (relaxed, casual)
- `'cross_arms'` - Cross arms (defensive, thinking, or confident)
- `'hands_on_hips'` - Hands on hips (confident, assertive)

**Parameters:**
- `userId` - Usually `'VRM_DISPLAY'`
- `pose` - String pose name
- `duration` - How long to hold pose in seconds (default: 3.0)

**Examples:**
```javascript
// Show interest in conversation
satellite.playPose('VRM_DISPLAY', 'lean_forward', 3.0);

// Confident stance
satellite.playPose('VRM_DISPLAY', 'hands_on_hips', 2.5);

// Thoughtful crossed arms
satellite.playPose('VRM_DISPLAY', 'cross_arms', 4.0);
```

### 5. Speaking / Lip Sync

Control lip sync animations (automatically triggers mouth movements):

```javascript
satellite.setSpeaking(speaking);
```

**Parameters:**
- `speaking` - Boolean: true when Mina starts speaking, false when done

**Examples:**
```javascript
// Start speaking (enables lip sync)
satellite.setSpeaking(true);

// Stop speaking (disables lip sync)
satellite.setSpeaking(false);
```

## Integration Examples

### Example 1: Greeting User

```javascript
// Wave and smile
satellite.playGesture('VRM_DISPLAY', 'wave', 2.0);
satellite.setExpression('VRM_DISPLAY', 'happy', 0.8, 3.0);
```

### Example 2: Reacting to a Funny Message

```javascript
// Laugh with animation
satellite.playEmote('VRM_DISPLAY', 'laugh', 3.0, 0.9);
// Or just the gesture
satellite.playGesture('VRM_DISPLAY', 'cheer', 2.5);
```

### Example 3: Explaining Something

```javascript
// Lean forward showing interest
satellite.playPose('VRM_DISPLAY', 'lean_forward', 2.0);
// Point to emphasize
setTimeout(() => {
    satellite.playGesture('VRM_DISPLAY', 'point', 1.5);
}, 1500);
```

### Example 4: Thinking About an Answer

```javascript
// Thinking pose
satellite.playGesture('VRM_DISPLAY', 'think', 3.0);
// Neutral/relaxed expression
satellite.setExpression('VRM_DISPLAY', 'relaxed', 0.5, 3.0);
```

### Example 5: Disagreeing

```javascript
// Shake head no
satellite.playGesture('VRM_DISPLAY', 'shake', 2.0);
// Show slight concern
satellite.setExpression('VRM_DISPLAY', 'sad', 0.3, 2.0);
```

## Animation Timing

- Gestures and emotes are **temporary** - they play once and return to idle
- Expressions can be **held indefinitely** (duration = 0) or timed
- Animations can be **chained** by using setTimeout or animation end events
- The idle animation (breathing, swaying) continues underneath all animations

## Tips for Natural Animation

1. **Combine gestures with expressions** for more expressive behavior
2. **Use timing** - don't spam animations, let them complete
3. **Context matters** - lean forward when interested, lean back when relaxed
4. **Vary intensity** - not everything needs to be at 100%
5. **Chain animations** for complex behaviors (think → nod → point)

## VRoid Studio Notes

Since your model is from VRoid Studio, it includes:
- Standard VRM bone structure (all gestures work)
- Facial expressions via blend shapes (aa, ih, ou, ee for lip sync)
- Full body IK-ready skeleton
- Finger bones for detailed hand poses

The animation system is designed to work with standard VRoid models out of the box!

## Technical Details

- Animations use **eased interpolation** for smooth motion
- **Idle animations** continue underneath (breathing, subtle sway)
- **Eye tracking** follows mouse when user moves cursor
- **Micro-saccades** add realism to idle eye movement
- **Finger curl** animations add life to hand gestures
- All rotations are in **radians**
- Bone names follow **VRM humanoid bone** specification

## Future Expansion

Potential additions:
- Custom animation sequencing
- Emotional state persistence
- Gesture combos (wave + nod)
- Dance animations
- Sitting/standing poses
- Object interaction (typing, holding items)

---

**Have fun bringing Mina to life with animations!** 🎭✨
