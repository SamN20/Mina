/**
 * VRM Animation Controller
 * Automatically triggers VRM animations based on AI responses and context
 */

const satellite = require('../../integrations/satellite');
const fs = require('fs');
const path = require('path');

const VRM_DISPLAY = 'VRM_DISPLAY';

/**
 * Get list of available animations from the assets folder
 * @returns {string} Comma-separated list of animation names
 */
function getAvailableAnimations() {
    try {
        const animDir = path.join(process.cwd(), 'assets', 'animations');
        if (!fs.existsSync(animDir)) return "None";

        const files = fs.readdirSync(animDir);
        const anims = files
            .filter(f => f.endsWith('.fbx'))
            .map(f => f.replace('.fbx', ''));
        
        return anims.join(', ');
    } catch (e) {
        console.error("Error reading animations:", e);
        return "None";
    }
}

/**
 * Analyze AI response and trigger appropriate animations
 * @param {string} response - The AI's text response
 * @param {Object} context - Context information (mood, intent, etc.)
 */
function triggerAnimationForResponse(response, context = {}) {
    if (!satellite.hasConnection(VRM_DISPLAY)) {
        return; // No VRM connected, skip
    }

    const lowerResponse = response.toLowerCase();
    
    // Greeting animations
    if (isGreeting(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'Waving', 2.0);
        satellite.setExpression(VRM_DISPLAY, 'happy', 0.7, 2.0);
        return;
    }

    // Laughing/Humor
    /*
    if (isLaughing(lowerResponse)) {
        satellite.playEmote(VRM_DISPLAY, 'laugh', 2.5, 0.8);
        return;
    }
    */

    // Agreement (Nod not available yet)
    /*
    if (isAgreeing(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'nod', 1.5);
        satellite.setExpression(VRM_DISPLAY, 'happy', 0.5, 2.0);
        return;
    }
    */

    // Disagreement
    /*
    if (isDisagreeing(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'shake', 1.5);
        satellite.setExpression(VRM_DISPLAY, 'sad', 0.3, 2.0);
        return;
    }
    */

    // Uncertainty
    /*
    if (isUncertain(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'shrug', 2.0);
        satellite.playEmote(VRM_DISPLAY, 'confused', 2.0, 0.6);
        return;
    }
    */

    // Thinking/Processing
    /*
    if (isThinking(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'think', 2.5);
        satellite.setExpression(VRM_DISPLAY, 'relaxed', 0.4, 2.5);
        return;
    }
    */

    // Celebration/Excitement
    if (isExcited(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'Joyful Jump', 2.5);
        satellite.setExpression(VRM_DISPLAY, 'happy', 0.9, 2.5);
        return;
    }

    // Surprise
    /*
    if (isSurprised(lowerResponse)) {
        satellite.playEmote(VRM_DISPLAY, 'surprised', 2.0, 0.8);
        return;
    }
    */

    // Sadness
    if (isSad(lowerResponse)) {
        satellite.playEmote(VRM_DISPLAY, 'sad', 2.5, 0.7);
        return;
    }

    // Interest/Engagement
    if (isInterested(lowerResponse)) {
        satellite.playPose(VRM_DISPLAY, 'lean_forward', 3.0);
        return;
    }

    // Pointing/Directing attention
    if (isDirecting(lowerResponse)) {
        satellite.playGesture(VRM_DISPLAY, 'point', 1.5);
        return;
    }

    // Default: subtle expression based on mood
    if (context.mood) {
        applyMoodExpression(context.mood);
    }
}

/**
 * Trigger animation based on detected emotion/intent
 * @param {string} emotion - Emotion name (happy, sad, angry, etc.)
 * @param {number} intensity - 0-1 intensity
 */
function triggerEmotion(emotion, intensity = 0.7) {
    if (!satellite.hasConnection(VRM_DISPLAY)) return;

    switch(emotion.toLowerCase()) {
        case 'happy':
        case 'joy':
            satellite.setExpression(VRM_DISPLAY, 'happy', intensity, 0);
            if (intensity > 0.7) {
                satellite.playGesture(VRM_DISPLAY, 'cheer', 2.0);
            }
            break;
        case 'sad':
        case 'disappointed':
            satellite.playEmote(VRM_DISPLAY, 'sad', 2.5, intensity);
            break;
        case 'angry':
        case 'frustrated':
            satellite.setExpression(VRM_DISPLAY, 'angry', intensity, 0);
            satellite.playPose(VRM_DISPLAY, 'cross_arms', 3.0);
            break;
        case 'surprised':
        case 'shocked':
            satellite.playEmote(VRM_DISPLAY, 'surprised', 2.0, intensity);
            break;
        case 'confused':
        case 'uncertain':
            satellite.playEmote(VRM_DISPLAY, 'confused', 2.0, intensity);
            break;
        case 'neutral':
            satellite.setExpression(VRM_DISPLAY, 'neutral', 0.5, 0);
            break;
        case 'relaxed':
        case 'calm':
            satellite.setExpression(VRM_DISPLAY, 'relaxed', intensity, 0);
            break;
    }
}

/**
 * Apply mood-based subtle expression
 */
function applyMoodExpression(mood) {
    if (!satellite.hasConnection(VRM_DISPLAY)) return;

    const level = mood.level || 0;
    
    if (level < 20) {
        satellite.setExpression(VRM_DISPLAY, 'happy', 0.3, 0);
    } else if (level < 50) {
        satellite.setExpression(VRM_DISPLAY, 'neutral', 0.5, 0);
    } else if (level < 80) {
        satellite.setExpression(VRM_DISPLAY, 'angry', 0.5, 0);
    } else {
        satellite.setExpression(VRM_DISPLAY, 'angry', 0.9, 0);
    }
}

/**
 * Control speaking state (for lip sync)
 */
function startSpeaking() {
    satellite.setSpeaking(true);
}

function stopSpeaking() {
    satellite.setSpeaking(false);
}

// --- Pattern Detection Functions ---

function isGreeting(text) {
    const patterns = [
        /\b(hello|hi|hey|greetings|howdy|sup|yo)\b/,
        /\bgood (morning|afternoon|evening)\b/,
        /\bnice to (see|meet) you\b/
    ];
    return patterns.some(p => p.test(text));
}

function isLaughing(text) {
    const patterns = [
        /\b(haha|lol|lmao|rofl)\b/,
        /\b(laughing|funny|hilarious)\b/,
        /\*laughs?\*/,
        /😂|🤣/
    ];
    return patterns.some(p => p.test(text));
}

function isAgreeing(text) {
    const patterns = [
        /^(yes|yeah|yep|yup|sure|absolutely|definitely|indeed|correct|right)\b/,
        /\bi agree\b/,
        /\byou'?re right\b/,
        /\bexactly\b/,
        /\bof course\b/
    ];
    return patterns.some(p => p.test(text));
}

function isDisagreeing(text) {
    const patterns = [
        /^(no|nope|nah|nay)\b/,
        /\bi (disagree|don'?t think so)\b/,
        /\bnot really\b/,
        /\bi'?m not sure (about )?that\b/
    ];
    return patterns.some(p => p.test(text));
}

function isUncertain(text) {
    const patterns = [
        /\b(maybe|perhaps|possibly|i don'?t know|not sure|uncertain)\b/,
        /\bcould be\b/,
        /\b(might|may) be\b/,
        /\bunsure\b/,
        /\bhmm+\b/,
        /🤷/
    ];
    return patterns.some(p => p.test(text));
}

function isThinking(text) {
    const patterns = [
        /\b(thinking|let me think|pondering|considering)\b/,
        /\blet me see\b/,
        /\bgive me (a )?(moment|second)\b/,
        /\bhmm+\b/,
        /🤔/
    ];
    return patterns.some(p => p.test(text));
}

function isExcited(text) {
    const patterns = [
        /\b(amazing|awesome|fantastic|incredible|wonderful|brilliant|excellent)\b/,
        /\b(yay|woohoo|woo|yippee)\b/,
        /!{2,}/,
        /\b(love|adore) (it|this|that)\b/,
        /🎉|🥳|✨/
    ];
    return patterns.some(p => p.test(text));
}

function isSurprised(text) {
    const patterns = [
        /\b(wow|whoa|oh|omg|what|really)\b/,
        /\b(surprised|shocked|amazed|astonished)\b/,
        /\bno way\b/,
        /😮|😲/
    ];
    return patterns.some(p => p.test(text));
}

function isSad(text) {
    const patterns = [
        /\b(sad|sorry|unfortunate|disappointed|terrible|awful)\b/,
        /\boh no\b/,
        /\bthat'?s (too )?bad\b/,
        /😢|😭|☹️/
    ];
    return patterns.some(p => p.test(text));
}

function isInterested(text) {
    const patterns = [
        /\b(interesting|fascinating|intriguing|curious)\b/,
        /\btell me more\b/,
        /\breally\?/,
        /\bgo on\b/
    ];
    return patterns.some(p => p.test(text));
}

function isDirecting(text) {
    const patterns = [
        /\b(look|see|check|watch|notice)\b/,
        /\bover there\b/,
        /\bright here\b/,
        /\bthis (one|is)\b/
    ];
    return patterns.some(p => p.test(text));
}

module.exports = {
    triggerAnimationForResponse,
    triggerEmotion,
    applyMoodExpression,
    startSpeaking,
    stopSpeaking,
    getAvailableAnimations
};
