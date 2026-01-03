const intentClassifier = require('../nlu/classifier');
const registry = require('../commands/registry');
// We will move 'ai' to src/core/ai later, for now require from root or assume let's use the one in root
const ai = require('../../integrations/ai');
const memory = require('../memory');
const { ActionType } = require('../types');
const mood = require('../../features/mood');

/**
 * Handle a user utterance
 * @param {string} text - The spoken text
 * @param {Object} context - { userId, guildId, username, guildName, member }
 * @returns {Promise<import('../types').ActionPlan>}
 */
async function handleUtterance(text, context) {
    console.log(`[Pipeline] Handling: "${text}" from ${context.username}`);

    // 1. Intent Classification
    // We use the existing classifier to get normalized text and intent
    const processed = intentClassifier.processTranscription(text);
    const normalizedText = processed.normalized;

    if (normalizedText !== text) {
        console.log(`[Normalized] "${text}" -> "${normalizedText}"`);
    }

    // Log Intent (Restored)
    if (processed.intent) {
        console.log(`[Intent] ${processed.intent} (confidence: ${(processed.confidence * 100).toFixed(0)}%)`);
    }
    if (processed.triggerConfidence) {
        console.log(`[AI] Trigger confidence: ${(processed.triggerConfidence * 100).toFixed(0)}%`);
    }


    // If classifier rejected it (no wake word, etc), we might stop here?
    // But voiceHandler usually calls this ONLY if it passed some checks. 
    // Wait, voiceHandler logic was: transcribe -> processTranscription -> if intent -> do stuff.
    // So we should expect 'text' here to be the raw transcription?
    // Actually, to be safe, let's assume we pass the RAW text and let pipeline handle normalization.

    // 2. Gate: Wake Word Check
    // Original behavior: If no wake word (intent is null), we stop.
    // Exceptions could be added here if we want "always on" commands.
    if (!processed.intent && !processed.triggerConfidence) {
        console.log(`[Pipeline] No wake word detected. Ignoring.`);
        return {};
    }

    // 3. Command Registry Lookup
    // Use afterWakeWord to ensure commands invoke only on the command part
    const query = processed.afterWakeWord || normalizedText;

    const match = registry.findMatch(query, context);
    if (match) {
        console.log(`[Pipeline] Matched command: ${match.command.id}`);
        return await match.command.execute(query, context, match.matches);
    }

    // 4. Fallback to AI (Gemini)
    const triggerConfidence = processed.triggerConfidence || 0;
    if (triggerConfidence < 0.6) {
        console.log(`[Pipeline] Low confidence (${triggerConfidence}), ignoring.`);
        return {}; // No action
    }


    console.log(`[Pipeline] No command match, asking AI...`);
    console.log(`[AI] Triggered by ${context.username}: "${query}"`);


    // AI Logic (Simulation of voiceHandler AI block)
    const memoryContext = await memory.getContext(context.userId, context.username, query);
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    const fullPrompt = `${memoryContext}\n[Current Time: ${dateString} at ${timeString}]\n[Your Current Status: "${context.currentStatus || 'Online'}"]\nUser: ${query}`;

    const response = await ai.generateResponse(fullPrompt);
    console.log(`[AI] Response: "${response}"`);


    if (response) {
        // Parse status changes from response
        let spokenResponse = response;
        
        // Parse Status
        const statusRegex = /\[status:\s*"?(.*?)"?\]/i;
        const statusMatch = spokenResponse.match(statusRegex);
        let meta = {};
        if (statusMatch) {
            meta.newStatus = statusMatch[1];
            spokenResponse = spokenResponse.replace(statusRegex, '').trim();
        }

        // Parse Tilt (Mood)
        const tiltRegex = /\[tilt:\s*([+-]?\d+)\]/i;
        const tiltMatch = spokenResponse.match(tiltRegex);
        if (tiltMatch) {
            const delta = parseInt(tiltMatch[1], 10);
            if (!isNaN(delta)) {
                mood.modifyTilt(delta);
            }
            spokenResponse = spokenResponse.replace(tiltRegex, '').trim();
        }

        // Check for Rage Quit Condition (Tilt >= 100)
        let shouldLeave = false;
        if (mood.getMood().level >= 100) {
            console.log('[Pipeline] Tilt reached 100%. Triggering Rage Quit.');
            shouldLeave = true;
            meta.newStatus = "Rage Quit";
        }

        // Memory learn
        memory.learnFromInteraction(context.userId, query, spokenResponse);

        return {
            [ActionType.TTS_SPEAK]: spokenResponse,
            [ActionType.LEAVE]: shouldLeave,
            metadata: meta
        };
    }

    return {};
}

module.exports = {
    handleUtterance
};
