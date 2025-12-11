# Complete Transcription & Wake-Word Flow

## Overview
This document traces the complete flow from when someone speaks to when Mina responds.

## Step-by-Step Flow

### 1. Audio Capture (voiceHandler.js)
- Discord user speaks → `receiver.speaking.on('start')` fires
- Opus stream created and piped through decoder to PCM (16kHz mono)
- PCM stream sent to `transcription.transcribeStream()`

### 2. Transcription (transcription.js → transcribe_whisper.py)
- Node spawns Python subprocess with Faster-Whisper
- Audio buffered until speaking ends (AfterSilence)
- Python transcribes full utterance and outputs JSON
- Result: Raw text like `"mean a pause"` or `"Minae"` or `"I mean, listen..."`

### 3. Intent Classification (intentClassifier.js)

#### A. Strip Speaker Prefix
```javascript
// Input: "Username: mean a pause"
// After: "mean a pause"
if (text.includes(':')) {
    spoken = parts.slice(1).join(':').trim();
}
```

#### B. Normalize Wake Word (normalizeWakeWord function)
**Order of operations (CRITICAL):**

1. **Standalone "Minae" check** (entire utterance)
   - `"Minae"` → `"Mina pause"` ✓
   - `"Minae."` → `"Mina pause"` ✓

2. **Specific "mean*" patterns with commands**
   - `"mean a pause"` → `"Mina pause"` ✓
   - `"mean-up play"` → `"Mina play"` ✓
   - `"meaner stop"` → `"Mina stop"` ✓
   - `"I mean, listen..."` → unchanged (no command after) ✓

3. **Wake word + misspelled commands**
   - `"Mina paus"` → `"Mina pause"` ✓
   - `"meena paz"` → `"Mina pause"` ✓
   - `"nina paus"` → `"Mina pause"` ✓

4. **General wake word variations**
   - `"meena what's up"` → `"Mina what's up"` ✓
   - `"nina play"` → `"Mina play"` ✓
   - `"minae stop"` → `"Mina stop"` ✓

5. **Standalone command misspellings**
   - `"Mina paz"` → `"Mina pause"` ✓

**Key Protection:** "mean" alone is NEVER normalized unless followed by music command words.

#### C. Wake Word Detection
```javascript
const match = normalized.match(/\bmina\b/i);
if (!match) return { intent: null };  // No wake word found
```

#### D. Position Check
```javascript
const matchIndex = normalized.toLowerCase().indexOf('mina');
const prefix = normalized.substring(0, matchIndex).trim();
const prefixWords = prefix.split(/\s+/).length;

if (prefixWords > 4) {
    return { intent: null };  // Wake word too deep in sentence
}
```

#### E. Extract Query
```javascript
// Get text after "Mina" (skip 4 chars)
const afterWakeWord = normalized.substring(matchIndex + 4).trim();
if (!afterWakeWord) return { intent: null };  // Nothing after wake word
```

#### F. Calculate Trigger Confidence
```javascript
let confidence = 1.0;

// Penalties:
- Wake word not at start: -15% per word before it
- Query < 3 words: -30%

// Bonuses:
- Has question indicators: +20%
- Query >= 5 words: +10%
- Starts with command word: +15%

return Math.max(0, Math.min(1, confidence));
```

#### G. Classify Intent (Music vs Chat)
```javascript
// Music indicators: pause, play, stop, skip, next, volume, etc.
// Chat indicators: how, what, why, can you, tell me, etc.

if (musicScore > chatScore) {
    return { intent: 'music', confidence: ... };
} else {
    return { intent: 'chat', confidence: ... };
}
```

**Returns:**
```javascript
{
    normalized: "Mina pause",
    afterWakeWord: "pause",
    intent: "music",
    confidence: 0.75,
    triggerConfidence: 0.85
}
```

### 4. Filtering (voiceHandler.js)

#### A. Check Query Length
```javascript
const queryWords = afterWakeWord.split(/\s+/).filter(Boolean).length;
const isMusicCommand = intent === 'music' && confidence > 0.6;

// Skip if < 3 words UNLESS it's a high-confidence music command
if (queryWords < 3 && !isMusicCommand) {
    console.log('[AI] Skipped: Query too short');
    return;
}
```

#### B. Check Trigger Confidence
```javascript
if (triggerConfidence < 0.6) {
    console.log('[AI] Skipped: Low trigger confidence');
    return;
}
```

#### C. Route Based on Intent
```javascript
if (intent === 'music' && confidence > 0.6) {
    // Send to satellite control (media keys)
    satelliteServer.sendCommand(userId, intent.type);
    return;  // Don't invoke AI
} else {
    // Invoke AI for chat
    gemini.generateResponse(query);
}
```

## Example Flows

### Example 1: "mean a pause"
1. Transcribed: `"mean a pause"`
2. Normalized: `"Mina pause"` (specific pattern matched)
3. Wake word found at index 0
4. After wake word: `"pause"`
5. Trigger confidence: 85% (command word bonus)
6. Intent: music (75% confidence)
7. Query words: 1
8. **Result:** Passes (music command exception) → Satellite control

### Example 2: "Minae"
1. Transcribed: `"Minae"`
2. Normalized: `"Mina pause"` (standalone special case)
3. Wake word found at index 0
4. After wake word: `"pause"`
5. Trigger confidence: 85%
6. Intent: music (75%)
7. Query words: 1
8. **Result:** Passes (music command exception) → Satellite control

### Example 3: "I mean, listen, I play games"
1. Transcribed: `"I mean, listen, I play games"`
2. Normalized: `"I mean, listen, I play games"` (no pattern match - "mean" not followed by command)
3. Wake word search: No "mina" found
4. **Result:** Skipped (no wake word)

### Example 4: "Mina what's up"
1. Transcribed: `"Mina what's up"`
2. Normalized: `"Mina what's up"` (already correct)
3. Wake word at index 0
4. After wake word: `"what's up"`
5. Trigger confidence: 90% (3 words, command word)
6. Intent: chat (question indicator)
7. Query words: 2
8. **Result:** Skipped (< 3 words and not music command)

### Example 5: "Mina what song is playing"
1. Transcribed: `"Mina what song is playing"`
2. Normalized: (unchanged)
3. Wake word at index 0
4. After wake word: `"what song is playing"`
5. Trigger confidence: 95% (5 words + question)
6. Intent: chat (question beats music keywords)
7. Query words: 4
8. **Result:** Passes all checks → AI invoked

## Current Issues & Solutions

### Issue: "mean a pause" normalizing incorrectly
**Root cause:** Conflicting regex patterns running in wrong order
**Solution:** Reordered normalizeWakeWord to process most specific patterns first

### Issue: Music commands rejected for being < 3 words
**Root cause:** Filter applied before checking intent type
**Solution:** Added exception for high-confidence music commands

### Issue: "I mean" triggering accidentally
**Root cause:** "mean" being normalized without context
**Solution:** Only normalize "mean*" when followed by music command words

## Configuration

### Adjustable Thresholds
- **Trigger confidence threshold:** 60% (line ~280 voiceHandler.js)
- **Music intent threshold:** 60% (line ~273 voiceHandler.js)
- **Min query words:** 3 (line ~271 voiceHandler.js)
- **Max wake word position:** 4 words from start (line ~179 intentClassifier.js)

### Wake Word Variations
Normalized to "Mina":
- meena, nina, mena, minae
- mean a, mean-up, meaner (only before commands)

### Music Commands
Recognized keywords:
- pause, play, stop, skip, next, previous, volume, mute, shuffle, repeat

### Question Indicators (Chat Intent)
- how, what, when, where, why, who, which
- can you, could you, would you, tell me, explain
