const fs = require('fs');
const path = require('path');

const SOUNDS_DIR = path.join(process.cwd(), 'data', 'sounds', 'soundboard');

/**
 * Get list of available sounds (filenames without extension)
 * Excludes directories and hidden files.
 * @returns {string[]}
 */
function getAvailableSounds() {
    if (!fs.existsSync(SOUNDS_DIR)) return [];

    try {
        const files = fs.readdirSync(SOUNDS_DIR);
        return files
            .filter(f => {
                const stat = fs.statSync(path.join(SOUNDS_DIR, f));
                return stat.isFile() && !f.startsWith('.');
            })
            .map(f => path.parse(f).name);
    } catch (e) {
        console.error('[Soundboard] Error listing sounds:', e);
        return [];
    }
}

/**
 * Get absolute path for a sound by name (fuzzy match)
 * @param {string} name 
 * @returns {string|null}
 */
function getSoundPath(name) {
    if (!name) return null;
    const cleanName = name.toLowerCase().trim();
    if (!fs.existsSync(SOUNDS_DIR)) return null;

    const files = fs.readdirSync(SOUNDS_DIR);

    // 1. Exact match (name.mp3)
    let match = files.find(f => path.parse(f).name.toLowerCase() === cleanName);

    // 2. Starts with
    if (!match) match = files.find(f => f.toLowerCase().startsWith(cleanName));

    // 3. Includes
    if (!match) match = files.find(f => f.toLowerCase().includes(cleanName));

    if (match) return path.join(SOUNDS_DIR, match);
    return null;
}

/**
 * Get prompt instruction for soundboard usage
 * @returns {string}
 */
function getPromptSupplement() {
    const sounds = getAvailableSounds().join(', ');
    if (!sounds) return "";

    return `
[Soundboard Available]
You can play a sound effect for comedic timing by including [sound:name] in your response.
Available Sounds: ${sounds}
Example: "That was terrible. [sound:cricket]" or "Gotcha! [sound:rimshot]"
Use sparingly and only for strong comedic effect.
DO NOT use [imagesound:...] or any other tags not listed here. Only use [sound:name].
`;
}

/**
 * Parse text into a sequence of speak/sound actions
 * @param {string} text 
 * @returns {Array<{type: 'speak'|'sound', content: string}>}
 */
function parseMixedAudio(text) {
    // Pre-clean hallucinations
    // The model sometimes hallucinates [imagesound: name], likely conflating features.
    text = text.replace(/\[imagesound:\s*.*?\]/gi, '');

    const sequence = [];
    // Regex matches [sound:name] globally, capturing name
    // We split by regex to get parts
    const regex = /\[sound:\s*(.*?)\]/gi;

    let lastIndex = 0;
    let match;

    // Reset regex index just in case
    regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
        // Text before match
        if (match.index > lastIndex) {
            const segment = text.substring(lastIndex, match.index).trim();
            if (segment) sequence.push({ type: 'speak', content: segment });
        }

        // The sound
        const soundName = match[1].trim();
        sequence.push({ type: 'sound', content: soundName });

        lastIndex = regex.lastIndex;
    }

    // Remaining text
    if (lastIndex < text.length) {
        const segment = text.substring(lastIndex).trim();
        if (segment) sequence.push({ type: 'speak', content: segment });
    }

    return sequence;
}

module.exports = {
    getAvailableSounds,
    getSoundPath,
    getPromptSupplement,
    parseMixedAudio
};
