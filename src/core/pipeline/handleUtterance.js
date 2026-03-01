const intentClassifier = require('../nlu/classifier');
const registry = require('../commands/registry');
// We will move 'ai' to src/core/ai later, for now require from root or assume let's use the one in root
const ai = require('../../integrations/ai');
const memory = require('../memory');
const { ActionType } = require('../types');
const mood = require('../../features/mood');
const vrmAnimation = require('../vrm/animation');
const wrapped = require('../../features/wrapped/store');
const history = require('../history');
const soundboard = require('../../features/soundboard/utils');

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
    // Query Expansion: use last 3 user messages + current query for richer memory retrieval
    const recentTexts = history.getRecentText(context.userId, 3);
    const expandedQuery = recentTexts.length > 0 ? recentTexts.join(' ') + ' ' + query : query;
    const memoryContext = await memory.getContext(context.userId, context.username, expandedQuery);

    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });

    // Session awareness
    const sessionNote = history.hasSessionGap(context.userId) ? '\n[Note: This is a new conversation session — some time has passed since last interaction.]\n' : '';

    const fullPrompt = `${memoryContext}${sessionNote}\n[Your Current Status: "${context.currentStatus || 'Online'}"]\n${soundboard.getPromptSupplement()}\nUser: ${query}`;

    // Get History Window FIRST (before adding current message, to avoid duplication)
    const voiceChannelName = context.channelName || 'Voice Chat';
    const historyWindow = history.getWithContextMarkers(context.userId);
    const options = {
        userId: context.userId,
        guildId: context.guildId,
        contextType: 'voice',
        userMessage: query
    };

    // Now add current user message to history (after retrieving, so it's not duplicated in the prompt)
    history.add(context.userId, 'user', query, context.username, { contextType: 'voice', channelName: voiceChannelName });

    const response = await ai.generateResponse(fullPrompt, historyWindow, options);
    console.log(`[AI] Response: "${response}"`);


    if (response) {
        // Wrapped: increment AI interaction
        try { wrapped.incrAIInteraction(context.userId, context.guildId, 1); } catch (e) { }

        // Use Shared Parser
        const parser = require('../ai/parser');
        const parsed = parser.parseResponse(response);

        let spokenResponse = parsed.spokenText;
        const meta = { newStatus: parsed.actions.status };

        // Log Thoughts
        if (parsed.thoughts) {
            console.log(`\n\x1b[36m[Mina's Thoughts]\x1b[0m\n${parsed.thoughts}\n`);
        }

        // Apply Mood Tilt
        if (parsed.actions.tilt !== null) {
            mood.modifyTilt(parsed.actions.tilt);
        }

        // Handle Animations
        const satellite = require('../../integrations/satellite');
        let triggeredAnim = null;
        if (parsed.actions.anims.length > 0) {
            parsed.actions.anims.forEach((animName, index) => {
                console.log(`[Pipeline] AI Triggered Animation: ${animName}`);
                triggeredAnim = animName;
                setTimeout(() => {
                    if (satellite && satellite.playGesture) {
                        satellite.playGesture(null, animName);
                    } else if (satellite && satellite.broadcast) {
                        satellite.broadcast('gesture', { type: animName, duration: 4.0 });
                    }
                }, index * 2500);
            });
        }

        // VRM Fallback
        if (!triggeredAnim) {
            try {
                const currentMood = mood.getMood();
                vrmAnimation.triggerAnimationForResponse(spokenResponse, { mood: currentMood });
            } catch (err) { console.error('[VRM Animation] Error:', err); }
        }

        // Rage Quit Check
        let shouldLeave = false;
        if (mood.getMood().level >= 100) {
            console.log('[Pipeline] Tilt reached 100%. Triggering Rage Quit.');
            shouldLeave = true;
            meta.newStatus = "Rage Quit";
        }

        // Handle DM
        let dmAction = null;
        if (parsed.actions.dm) {
            const { targetName, messageContent } = parsed.actions.dm;
            console.log(`[Pipeline] AI wants to DM "${targetName}": "${messageContent}"`);
            const targetUser = memory.findUserByName(targetName);
            if (targetUser) {
                console.log(`[Pipeline] Resolved "${targetName}" to User ID: ${targetUser.id}`);
                dmAction = { userId: targetUser.id, message: messageContent };
            } else {
                console.warn(`[Pipeline] Could not find user "${targetName}" for DM.`);
            }
        }

        // Parse Soundboard mixed with text
        const sequence = soundboard.parseMixedAudio(spokenResponse);

        // Strip tags for clean text for memory/TTS
        // Strip tags/thoughts for clean text for memory/TTS
        spokenResponse = spokenResponse.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
        spokenResponse = spokenResponse.replace(/\[sound:\s*(.*?)\]/gi, '').replace(/\[\/sound\]/gi, '').trim();

        // Memory learn
        const historyForLearning = history.get(context.userId);
        memory.learnFromInteraction(context.userId, query, spokenResponse, historyForLearning, parsed.thoughts);

        // Update History (Add AI Response)
        // CRITICAL FIX: Save the RAW 'response' (with tags) effectively.
        // If we save 'spokenResponse', the AI sees history where it "sent a DM" but there is no tag,
        // so it learns to NOT generate tags.
        history.add(context.userId, 'assistant', response, 'Mina', { contextType: 'voice', channelName: voiceChannelName });

        // Trigger rolling summarization (non-blocking, fire and forget)
        history.summarizeOldHistory(context.userId).catch(e => console.error('[Pipeline] Summarization error:', e));

        // Construct plan
        // Use AUDIO_SEQUENCE if we have multiple parts or just one sound part
        // If just simple text, use TTS_SPEAK for backward compat (or just sequence)

        // If sequence has > 1 item OR contains a sound, use sequence.
        // Otherwise just TTS.
        let hasSound = sequence.some(s => s.type === 'sound');

        if (hasSound || sequence.length > 1) {
            return {
                [ActionType.AUDIO_SEQUENCE]: sequence,
                [ActionType.LEAVE]: shouldLeave,
                [ActionType.SEND_DM]: dmAction,
                metadata: meta
            };
        } else {
            return {
                [ActionType.TTS_SPEAK]: spokenResponse,
                [ActionType.LEAVE]: shouldLeave,
                [ActionType.SEND_DM]: dmAction,
                metadata: meta
            };
        }
    }

    return {};
}

module.exports = {
    handleUtterance
};
