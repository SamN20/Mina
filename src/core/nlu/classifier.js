/**
 * Intent Classifier for Mina
 * Determines if user wants music control or AI chat
 */

const storage = require('../storage');

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

/**
 * Parse reminder requests from text
 * @param {string} text - Input text (after wake word)
 * @returns {object|null} - Parsed reminder or null
 */
function parseReminder(text) {
    // Patterns for reminder requests
    // Use greedy (.+) for message to capture up to the LAST "in/at"
    const patterns = [
        /remind me (?:to )?(.+)(?:\s+in\s+(.+))/i,
        /set a reminder (?:to |for )?(.+)(?:\s+in\s+(.+))/i,
        /remind me (?:to )?(.+)(?:\s+at\s+(.+))/i,
        /set a reminder (?:to |for )?(.+)(?:\s+at\s+(.+))/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const message = match[1].trim();
            const timeStr = match[2];

            if (message && timeStr) {
                const parsedTime = parseTime(timeStr);
                if (parsedTime) {
                    return {
                        message,
                        remindAt: parsedTime.toISOString()
                    };
                }
            }
        }
    }

    return null;
}

/**
 * Parse timer requests
 * @param {string} text 
 * @returns {object|null}
 */
function parseTimer(text) {
    const patterns = [
        /set a timer for (.+)/i,
        /set timer for (.+)/i,
        /^timer for (.+)/i,
        /set a (.+) timer/i,
        /set (.+) timer/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const timeStr = match[1].trim();
            const parsedTime = parseTime(timeStr);
            if (parsedTime) {
                return {
                    message: "Timer",
                    remindAt: parsedTime.toISOString(),
                    isTimer: true
                };
            }
        }
    }
    return null;
}

/**
 * Convert number words to digits
 * @param {string} text 
 * @returns {string}
 */
function convertWordsToNumbers(text) {
    const map = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'twenty': 20, 'thirty': 30,
        'forty': 40, 'fifty': 50, 'sixty': 60
    };
    return text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty)\b/gi, match => map[match.toLowerCase()] || match);
}

/**
 * Parse time strings into Date objects
 * @param {string} timeStr - Time string like "30 minutes", "2 hours", "tomorrow at 3pm"
 * @returns {Date|null} - Parsed date or null
 */
function parseTime(timeStr) {
    const now = new Date();
    let targetTime = new Date(now);

    // Normalize: convert words to numbers
    timeStr = convertWordsToNumbers(timeStr.toLowerCase());

    // Handle duration (composite supported: "1 hour 30 minutes")
    // Look for any number followed by a unit
    const unitRegex = /(\d+)\s*(minute|min|hour|hr|day|week|second|sec)s?/gi;
    let hasDuration = false;
    let match;

    // Scan for all duration parts
    while ((match = unitRegex.exec(timeStr)) !== null) {
        hasDuration = true;
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'second':
            case 'sec':
                targetTime.setSeconds(targetTime.getSeconds() + amount);
                break;
            case 'minute':
            case 'min':
                targetTime.setMinutes(targetTime.getMinutes() + amount);
                break;
            case 'hour':
            case 'hr':
                targetTime.setHours(targetTime.getHours() + amount);
                break;
            case 'day':
                targetTime.setDate(targetTime.getDate() + amount);
                break;
            case 'week':
                targetTime.setDate(targetTime.getDate() + amount * 7);
                break;
        }
    }

    if (hasDuration) return targetTime;

    // Handle "at X" - simple time parsing
    // Make "at" optional
    const atPattern = /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const atMatch = timeStr.match(atPattern);
    if (atMatch) {
        // Ensure it's not just a random number (require am/pm OR colon OR "at")
        // If "at" is missing, we need stronger signal like am/pm or colon
        const hasAt = timeStr.includes('at');
        const hasColon = !!atMatch[2];
        const hasAmPm = !!atMatch[3];

        if (!hasAt && !hasColon && !hasAmPm) {
            // Just a number like "5" - ambiguous, could be duration without unit? 
            // But duration regex handles units.
            // Assume it's time if it's in a time context, but be careful.
            // For now, require at least one indicator if "at" is missing.
            return null;
        }

        let hour = parseInt(atMatch[1]);
        const minute = parseInt(atMatch[2] || 0);
        const ampm = atMatch[3]?.toLowerCase();

        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;

        targetTime.setHours(hour, minute, 0, 0);

        // If the time is in the past today, assume tomorrow
        if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
        }

        return targetTime;
    }

    // Handle "tomorrow at X"
    const tomorrowPattern = /tomorrow(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const tomorrowMatch = timeStr.match(tomorrowPattern);
    if (tomorrowMatch) {
        let hour = parseInt(tomorrowMatch[1]);
        const minute = parseInt(tomorrowMatch[2] || 0);
        const ampm = tomorrowMatch[3]?.toLowerCase();

        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;

        targetTime.setDate(targetTime.getDate() + 1);
        targetTime.setHours(hour, minute, 0, 0);

        return targetTime;
    }

    return null;
}

module.exports = {
    normalizeWakeWord,
    classifyIntent,
    calculateTriggerConfidence,
    processTranscription,
    parseReminder,
    parseTimer
};
