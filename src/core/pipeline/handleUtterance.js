const intentClassifier = require('../nlu/classifier');
const registry = require('../commands/registry');
// We will move 'ai' to src/core/ai later, for now require from root or assume let's use the one in root
const ai = require('../../integrations/ai');
const memory = require('../memory');
const { ActionType } = require('../types');

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
    const memoryContext = memory.getContext(context.userId, context.username, query);
    // We need status? context.currentStatus can be passed in
    const fullPrompt = `${memoryContext}\n[Your Current Status: "${context.currentStatus || 'Online'}"]\nUser: ${query}`;

    const response = await ai.generateResponse(fullPrompt);
    console.log(`[AI] Response: "${response}"`);


    if (response) {
        // Parse status changes from response
        let spokenResponse = response;
        const statusRegex = /\[status:\s*"?(.*?)"?\]/i;
        const statusMatch = response.match(statusRegex);

        let meta = {};
        if (statusMatch) {
            meta.newStatus = statusMatch[1];
            spokenResponse = response.replace(statusRegex, '').trim();
        }

        // Memory learn
        memory.learnFromInteraction(context.userId, query, spokenResponse);

        return {
            [ActionType.TTS_SPEAK]: spokenResponse,
            metadata: meta
        };
    }

    return {};
}

module.exports = {
    handleUtterance
};
