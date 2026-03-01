const mood = require('../../features/mood');
const vrmAnimation = require('../vrm/animation');

/**
 * Parses the raw AI response to extract structured data and clean speech.
 * @param {string} rawResponse 
 * @returns {Object} { spokenText, thoughts, actions: { dm, tilt, status, anims } }
 */
function parseResponse(rawResponse) {
    let spokenText = rawResponse || "";
    let thoughts = "";
    const actions = {
        dm: null,
        tilt: null,
        status: null,
        anims: []
    };

    if (!spokenText) return { spokenText, thoughts, actions };

    // 1. Extract Thoughts (support multiple tag variants the model might emit)
    // Matches: <thought>...</thought>, <thinking>...</thinking>, <thoughts>...</thoughts> (case-insensitive)
    const thoughtRegex = /<\s*(thought|thinking|thoughts)[^>]*>([\s\S]*?)<\/\s*(thought|thinking|thoughts)\s*>/i;
    const thoughtMatch = spokenText.match(thoughtRegex);
    if (thoughtMatch) {
        thoughts = (thoughtMatch[2] || '').trim();
        // Remove all occurrences of thought-like tags
        spokenText = spokenText.replace(/<\s*(thought|thinking|thoughts)[^>]*>[\s\S]*?<\/\s*(thought|thinking|thoughts)\s*>/gi, '').trim();
    }

    // Also defensively strip any lingering standalone opening/closing thought-like tags
    spokenText = spokenText.replace(/<\s*\/?\s*(thought|thinking|thoughts)[^>]*>/gi, '').trim();

    // 2. Cleanup Hallucinated Timestamps/Prefixes
    // e.g. "[1/6 10:00] (Mina): text" or "[User]: text" or "<msg ...> text"
    // We run this globally to catch "double responses" where the AI acts out multiple turns.

    // Pattern 1: [Date/Time] (Name):
    spokenText = spokenText.replace(/\[\d{1,2}\/\d{1,2}\s\d{2}:\d{2}\]\s*(\(.*?\))?:?\s*/g, ' ').trim();

    // Pattern 2: (Name): or [Name]: prefix (common fallback)
    spokenText = spokenText.replace(/^\s*[\[\(].*?[\]\)]:\s*/gm, ' ').trim();

    // Pattern 3: XML msg tags (just in case they leaked into spoken text)
    spokenText = spokenText.replace(/<msg.*?>/gi, '').replace(/<\/msg>/gi, '').trim();

    // 3. Extract Status
    const statusRegex = /\[status:\s*"?(.*?)"?\]/i;
    const statusMatch = spokenText.match(statusRegex);
    if (statusMatch) {
        actions.status = statusMatch[1];
        spokenText = spokenText.replace(statusRegex, '').trim();
    }

    // 4. Extract Tilt (Mood)
    const tiltRegex = /\[tilt:\s*([+-]?\d+)\]/i;
    const tiltMatch = spokenText.match(tiltRegex);
    if (tiltMatch) {
        const delta = parseInt(tiltMatch[1], 10);
        if (!isNaN(delta)) {
            actions.tilt = delta;
        }
        spokenText = spokenText.replace(tiltRegex, '').trim();
    }

    // 5. Extract DM
    // Handles nested brackets by finding the balanced closing bracket
    const dmStartMarker = "[dm:";
    const dmStartIndex = spokenText.toLowerCase().indexOf(dmStartMarker);
    if (dmStartIndex !== -1) {
        let depth = 0;
        let dmEndIndex = -1;

        for (let i = dmStartIndex; i < spokenText.length; i++) {
            if (spokenText[i] === '[') depth++;
            else if (spokenText[i] === ']') depth--;

            if (depth === 0) {
                dmEndIndex = i;
                break;
            }
        }

        if (dmEndIndex !== -1) {
            const fullTag = spokenText.substring(dmStartIndex, dmEndIndex + 1);
            const content = spokenText.substring(dmStartIndex + 4, dmEndIndex); // skip "[dm:"
            const firstColon = content.indexOf(':');

            if (firstColon !== -1) {
                const targetName = content.substring(0, firstColon).trim();
                const messageContent = content.substring(firstColon + 1).trim();
                actions.dm = { targetName, messageContent };
            }

            spokenText = spokenText.replace(fullTag, '').trim();
        }
    }

    // 6. Extract Animations
    // [anim: name]
    const animRegex = /\[anim:\s*(.*?)\]/gi;
    const animMatches = [...spokenText.matchAll(animRegex)];
    if (animMatches.length > 0) {
        animMatches.forEach(m => {
            actions.anims.push(m[1].trim());
        });
        spokenText = spokenText.replace(animRegex, '').trim();
    }

    // Note: Soundboard tags [sound:...] are usually handled by the soundboard utility *after* this or during TTS.
    // However, if we want a fully clean text for other purposes, we might want to strip them here?
    // The current pipeline handles soundboard mixed audio separately. 
    // Ideally, we should leave sound tags IN spokenText so `soundboard.parseMixedAudio` can interpret them later,
    // OR we standardize. 
    // Current `handleUtterance` flow: 
    // 1. `spokenResponse` (cleaned of thoughts/status/dm/tilt/anim) -> 2. `soundboard.parseMixedAudio(spokenResponse)`
    // So we should NOT strip sound tags here.

    return { spokenText, thoughts, actions };
}

module.exports = { parseResponse };
