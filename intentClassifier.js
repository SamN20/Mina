/**
 * Intent Classifier for Mina
 * Determines if user wants music control or AI chat
 */

const storage = require('./storage');

function debugLog(...args) {
    if (storage.getDebugMode()) {
        console.log(...args);
    }
}

// Music control keywords
const MUSIC_KEYWORDS = [
    'pause', 'play', 'stop', 'skip', 'next', 'previous', 'prev', 
    'volume', 'louder', 'quieter', 'mute', 'unmute', 'shuffle',
    'repeat', 'song', 'music', 'track',
    'paz', 'paus'  // Common transcription errors for "pause"
];

// Media info question patterns (what's playing, what song, etc.)
const MEDIA_INFO_PATTERNS = [
    /what'?s? (playing|this song|the song|this track|this music|on)/i,
    /what song is (this|playing|on)/i,
    /what (song|track|music) (is |are )?(this|playing|on)/i,
    /(tell me |what's )?(the |this )?song (name|title)/i,
    /who'?s? (singing|playing|the artist)/i,
    /what'?s? this (song|track|music|playing)/i
];

// Question indicators (more likely to be AI chat)
const QUESTION_INDICATORS = [
    'how', 'what', 'when', 'where', 'why', 'who', 'which',
    'can you', 'could you', 'would you', 'will you',
    'do you', 'are you', 'is it', 'tell me', 'explain'
];

/**
 * Normalize wake word variations
 * @param {string} text - Input text
 * @returns {string} - Normalized text with "Mina" standardized
 */
function normalizeWakeWord(text) {
    let normalized = text;

    // STEP 0: Protect conversational "mean" patterns from normalization
    // If text starts with "I mean" or "mean," (conversational), don't normalize it
    if (/^(I\s+)?mean[,\s]/i.test(normalized.trim())) {
        // Check if there's a music command later - only normalize if there is
        if (!/\b(pause|play|stop|skip|next|previous|prev)\b/i.test(normalized)) {
            return normalized;  // Keep as-is, it's conversational
        }
        // If there IS a command, we still need to be careful
        // Only normalize if the command is within the first few words after "mean"
        const afterMean = normalized.replace(/^(I\s+)?mean[,\s]*/i, '').trim();
        const firstWords = afterMean.split(/\s+/).slice(0, 3).join(' ');
        if (!/\b(pause|play|stop|skip|next|previous|prev)\b/i.test(firstWords)) {
            return normalized;  // Command too far away, keep as-is
        }
    }

    // STEP 1: Handle standalone "Minae" (entire utterance) as special case for "Mina pause"
    if (/^minae[.!?\s]*$/i.test(normalized.trim())) {
        return 'Mina pause';
    }

    // STEP 2: Handle specific transcription errors ONLY when followed by music commands
    // This prevents "I mean, listen..." from being normalized
    // Order matters: do these BEFORE the general replacements
    normalized = normalized.replace(/^mean[\s-]*a\s+(pause|play|stop|skip|next|previous|prev)/gi, 'Mina $1');
    normalized = normalized.replace(/^mean[\s-]*up\s+(pause|play|stop|skip|next|previous|prev)/gi, 'Mina $1');
    normalized = normalized.replace(/^meet[\s-]*up\s+(pause|play|stop|skip|next|previous|prev)/gi, 'Mina $1');
    normalized = normalized.replace(/^meaner\s+(pause|play|stop|skip|next|previous|prev)/gi, 'Mina $1');

    // STEP 3: Handle "Mina/variation + Paus/Paz" -> "Mina pause"
    // Do this BEFORE general variation replacement
    normalized = normalized.replace(/\b(mina|meena|nina|mena|minae)\s*(paus|paz)\b/gi, 'Mina pause');

    // STEP 4: Replace general wake word variations (but NOT "mean" alone)
    normalized = normalized.replace(/\bmeena\b/gi, 'Mina');
    normalized = normalized.replace(/\bnina\b/gi, 'Mina');
    normalized = normalized.replace(/\bmena\b/gi, 'Mina');
    normalized = normalized.replace(/\bminae\b/gi, 'Mina');

    // STEP 5: Normalize standalone command misspellings
    normalized = normalized.replace(/\bpaz\b/gi, 'pause');
    normalized = normalized.replace(/\bpaus\b/gi, 'pause');
    
    return normalized;
}

/**
 * Calculate confidence that the wake-word trigger was intentional
 * @param {number} prefixWords - Words before wake word
 * @param {string} afterWakeWord - Query after wake word
 * @returns {number} - Confidence 0-1
 */
function calculateTriggerConfidence(prefixWords, afterWakeWord) {
    let confidence = 1.0;
    
    // Penalize if wake word appears deep in sentence
    if (prefixWords > 0) {
        confidence -= (prefixWords * 0.15); // -15% per word before wake
    }
    
    // Boost if query has question indicators (likely intentional)
    const hasQuestion = /\?|how|what|when|where|why|who|can you|could you|tell me/i.test(afterWakeWord);
    if (hasQuestion) {
        confidence += 0.2;
    }
    
    // Penalize very short queries (< 3 words likely accidental)
    const queryWords = afterWakeWord.trim().split(/\s+/).filter(Boolean).length;
    if (queryWords < 3) {
        confidence -= 0.3;
    } else if (queryWords >= 5) {
        confidence += 0.1; // Boost longer queries
    }
    
    // Boost if starts with common command words
    if (/^(play|pause|stop|skip|next|tell|what|show|can|please)/i.test(afterWakeWord)) {
        confidence += 0.15;
    }
    
    return Math.max(0, Math.min(1, confidence)); // Clamp 0-1
}

/**
 * Classify intent: music control vs AI chat
 * @param {string} text - The transcribed text (after wake word)
 * @returns {Object} - { intent: 'music'|'chat', confidence: 0-1 }
 */
function classifyIntent(text) {
    const lowerText = text.toLowerCase();
    
    // Check for media info patterns first (high priority)
    let isMediaInfoQuery = false;
    for (const pattern of MEDIA_INFO_PATTERNS) {
        if (pattern.test(text)) {
            isMediaInfoQuery = true;
            break;
        }
    }
    
    // Count music keywords
    const musicScore = MUSIC_KEYWORDS.reduce((score, keyword) => {
        return score + (lowerText.includes(keyword) ? 1 : 0);
    }, 0);
    
    // Count question indicators
    const questionScore = QUESTION_INDICATORS.reduce((score, indicator) => {
        return score + (lowerText.includes(indicator) ? 1 : 0);
    }, 0);
    
    // Check for punctuation (questions are more likely AI)
    const hasQuestion = lowerText.includes('?');
    const questionBonus = hasQuestion ? 2 : 0;
    
    // Very short commands (1-2 words) are usually music
    const words = text.trim().split(/\s+/);
    const isShortCommand = words.length <= 2;
    
    // Calculate scores
    let totalMusicScore = musicScore + (isShortCommand ? 2 : 0);
    let totalChatScore = questionScore + questionBonus;
    
    // CRITICAL: Media info queries are ALWAYS music, even if they're questions
    if (isMediaInfoQuery) {
        totalMusicScore += 10; // Heavy boost to override question indicators
    }
    
    // Determine intent
    if (totalMusicScore > totalChatScore) {
        return {
            intent: 'music',
            confidence: Math.min(totalMusicScore / (totalMusicScore + totalChatScore + 1), 0.95)
        };
    } else if (totalChatScore > totalMusicScore) {
        return {
            intent: 'chat',
            confidence: Math.min(totalChatScore / (totalMusicScore + totalChatScore + 1), 0.95)
        };
    } else {
        // Ambiguous - default to chat for longer text, music for short
        return {
            intent: isShortCommand ? 'music' : 'chat',
            confidence: 0.5
        };
    }
}

/**
 * Process transcription with wake word normalization and intent classification
 * @param {string} text - Raw transcription
 * @returns {Object} - { normalized: string, intent: string, confidence: number }
 */
function processTranscription(text) {
    // If the text contains a speaker prefix like "Name: ...", strip it and only consider the spoken part
    let spoken = text;
    if (text.includes(':')) {
        const parts = text.split(':');
        // take everything after the first colon (handles "Name: speech")
        spoken = parts.slice(1).join(':').trim();
    }

    debugLog(`[Debug] Original: "${text}"`);
    debugLog(`[Debug] Spoken (after strip): "${spoken}"`);

    const normalized = normalizeWakeWord(spoken);
    debugLog(`[Debug] Normalized: "${normalized}"`);

    // Only trigger if wake word appears near the start of the spoken utterance
    const wakeWordPattern = /\bmina\b/i;
    const match = normalized.match(wakeWordPattern);
    if (!match) {
        debugLog(`[Debug] No wake word found`);
        return { normalized: normalized, intent: null, confidence: 0 };
    }

    console.log(`[Debug] Wake word found at: ${match.index}`);

    const matchIndex = normalized.toLowerCase().indexOf('mina');
    // Count words before the wake word - require it to be within the first 4 words
    const prefix = normalized.substring(0, matchIndex).trim();
    const prefixWords = prefix.length === 0 ? 0 : prefix.split(/\s+/).length;
    debugLog(`[Debug] Prefix: "${prefix}", prefixWords: ${prefixWords}`);
    
    if (prefixWords > 4) {
        // Wake word appears too deep into the sentence; ignore it to avoid false triggers
        debugLog(`[Debug] Wake word too deep (${prefixWords} words before it)`);
        return { normalized: normalized, intent: null, confidence: 0 };
    }

    const afterWakeWord = normalized.substring(matchIndex + 4).trim();
    debugLog(`[Debug] After wake word: "${afterWakeWord}"`);
    
    if (!afterWakeWord) {
        debugLog(`[Debug] Nothing after wake word`);
        return { normalized: normalized, intent: null, confidence: 0, triggerConfidence: 0 };
    }

    // Calculate trigger confidence
    const triggerConfidence = calculateTriggerConfidence(prefixWords, afterWakeWord);

    const classification = classifyIntent(afterWakeWord);

    return {
        normalized,
        afterWakeWord,
        intent: classification.intent,
        confidence: classification.confidence,
        triggerConfidence: triggerConfidence
    };
}

module.exports = {
    normalizeWakeWord,
    classifyIntent,
    calculateTriggerConfidence,
    processTranscription
};
