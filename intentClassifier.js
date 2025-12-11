/**
 * Intent Classifier for Mina
 * Determines if user wants music control or AI chat
 */

// Music control keywords
const MUSIC_KEYWORDS = [
    'pause', 'play', 'stop', 'skip', 'next', 'previous', 'prev', 
    'volume', 'louder', 'quieter', 'mute', 'unmute', 'shuffle',
    'repeat', 'song', 'music', 'track',
    'paz', 'paus'  // Common transcription errors for "pause"
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
    // Replace all variations of Mina with "Mina"
    const variations = [
        /\bmeena\b/gi,
        /\bnina\b/gi,
        /\bmena\b/gi,
        /\bmina\s*paus/gi,  // "Mina Paus" -> "Mina pause"
        /\bmean\s*a\b/gi,
        /\bme\s*and\s*a\b/gi
    ];

    let normalized = text;
    
    // Handle "Mina Paus/Paz" -> "Mina pause"
    normalized = normalized.replace(/\b(mina|meena|nina|mean)\s*(paus|paz)\b/gi, 'Mina pause');
    
    // Replace other variations
    for (const pattern of variations) {
        normalized = normalized.replace(pattern, 'Mina');
    }
    
    // Normalize common command misspellings
    normalized = normalized.replace(/\b(paz|paus)\b/gi, 'pause');
    normalized = normalized.replace(/\bmean\s+up\b/gi, 'Mina');
    
    return normalized;
}

/**
 * Classify intent: music control vs AI chat
 * @param {string} text - The transcribed text (after wake word)
 * @returns {Object} - { intent: 'music'|'chat', confidence: 0-1 }
 */
function classifyIntent(text) {
    const lowerText = text.toLowerCase();
    
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
    const totalMusicScore = musicScore + (isShortCommand ? 2 : 0);
    const totalChatScore = questionScore + questionBonus;
    
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
    const normalized = normalizeWakeWord(text);
    
    // Extract text after wake word
    const wakeWordPattern = /\bmina\b/gi;
    const match = wakeWordPattern.exec(normalized);
    
    if (!match) {
        return { normalized, intent: null, confidence: 0 };
    }
    
    const afterWakeWord = normalized.substring(match.index + match[0].length).trim();
    
    if (!afterWakeWord) {
        return { normalized, intent: null, confidence: 0 };
    }
    
    const classification = classifyIntent(afterWakeWord);
    
    return {
        normalized,
        afterWakeWord,
        intent: classification.intent,
        confidence: classification.confidence
    };
}

module.exports = {
    normalizeWakeWord,
    classifyIntent,
    processTranscription
};
