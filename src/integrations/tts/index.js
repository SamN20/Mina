const fs = require('fs');
const path = require('path');
const gtts = require('./engines/gtts');
const edge = require('./engines/edge');
const azure = require('./engines/azure');
// const vibevoice = require('./engines/vibevoice');

const engines = {
    'gtts': gtts,
    'edge': edge,
    'azure': azure,
    'vibevoice': null
};

async function generateSpeech(text, options = {}) {
    // 1. Determine engine
    let engineName = process.env.TTS_ENGINE || 'gtts';
    engineName = engineName.toLowerCase();

    // 2. Validate/Load Engine
    if (engineName === 'vibevoice' && !engines['vibevoice']) {
        try {
            engines['vibevoice'] = require('./engines/vibevoice');
        } catch (e) {
            console.error("Failed to load VibeVoice:", e);
            engineName = 'gtts';
        }
    }

    // Force Azure if options.style is present (as it's the only one supporting styles right now)
    if (options.style && options.style !== 'chat') {
        engineName = 'azure';
    }

    if (!engines[engineName]) {
        console.warn(`Engine '${engineName}' not found. Defaulting to gTTS.`);
        engineName = 'gtts';
    }

    const engine = engines[engineName];

    try {
        let result = await engine.generate(text, options);
        if (!result) throw new Error("No result returned");
        return result;
    } catch (e) {
        console.error(`[TTS] ${engineName} failed:`, e.message);

        // Fallback Chain
        // Azure -> Edge -> gTTS
        if (engineName === 'azure') {
            console.log("[TTS] Fallback: Azure -> Edge");
            try { return await engines['edge'].generate(text, options); }
            catch (e2) {
                console.log("[TTS] Fallback: Edge -> gTTS");
                return await engines['gtts'].generate(text, options);
            }
        }
        else if (engineName === 'edge') {
            console.log("[TTS] Fallback: Edge -> gTTS");
            return await engines['gtts'].generate(text, options);
        }
        else {
            return null;
        }
    }
}

module.exports = { generateSpeech };
