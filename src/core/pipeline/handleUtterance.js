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
    const memoryContext = await memory.getContext(context.userId, context.username, query);

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    const fullPrompt = `${memoryContext}\n[Your Current Status: "${context.currentStatus || 'Online'}"]\n${soundboard.getPromptSupplement()}\nUser: ${query}`;

    // Update History (Add User Query)
    history.add(context.userId, 'user', query, context.username);

    // Get History Window
    const historyWindow = history.get(context.userId);

    const response = await ai.generateResponse(fullPrompt, historyWindow);
    console.log(`[AI] Response: "${response}"`);


    if (response) {
        // Wrapped: increment AI interaction
        try { wrapped.incrAIInteraction(context.userId, context.guildId, 1); } catch (e) { }
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

        // Parse Animations (Tag System) - Support Multiple
        const animRegex = /\[anim:\s*(.*?)\]/gi;
        let triggeredAnim = null;
        let match;

        // Find all matches
        const satellite = require('../../integrations/satellite');

        // We use a temporary string to avoid infinite loop if we were replacing in place using exec
        // But cleaner way: match all, then replace all
        const animMatches = [...spokenResponse.matchAll(animRegex)];

        if (animMatches.length > 0) {
            animMatches.forEach((m, index) => {
                const animName = m[1].trim();
                console.log(`[Pipeline] AI Triggered Animation: ${animName}`);
                triggeredAnim = animName; // Just track at least one was found

                // Play with slight delay between if multiple? 
                // Currently satellite just blasts them. 
                // Let's stagger them slightly if multiple? e.g. 2s apart
                setTimeout(() => {
                    if (satellite && satellite.playGesture) {
                        satellite.playGesture(null, animName);
                    } else if (satellite && satellite.broadcast) {
                        satellite.broadcast('gesture', { type: animName, duration: 4.0 });
                    }
                }, index * 2500);
            });

            // Remove tags from speech
            spokenResponse = spokenResponse.replace(animRegex, '').trim();
        }

        // Trigger VRM animations based on keywords (Legacy/Fallback)
        // Only if AI didn't explicitly ask for one
        if (!triggeredAnim) {
            try {
                const currentMood = mood.getMood();
                vrmAnimation.triggerAnimationForResponse(spokenResponse, { mood: currentMood });
            } catch (err) {
                console.error('[VRM Animation] Error:', err);
            }
        }

        // Check for Rage Quit Condition (Tilt >= 100)
        let shouldLeave = false;
        if (mood.getMood().level >= 100) {
            console.log('[Pipeline] Tilt reached 100%. Triggering Rage Quit.');
            shouldLeave = true;
            meta.newStatus = "Rage Quit";
        }

        // Parse Soundboard mixed with text
        // We use the sequence approach
        const sequence = soundboard.parseMixedAudio(spokenResponse);

        // Strip tags for clean text log/history
        const originalResponse = spokenResponse;
        spokenResponse = spokenResponse.replace(/\[sound:\s*(.*?)\]/gi, '').trim();

        // Parse DM Tags with Bracket Counting (Nested Support)
        const dmStartMarker = "[dm:";
        const dmStartIndex = originalResponse.toLowerCase().indexOf(dmStartMarker);
        let dmAction = null;

        if (dmStartIndex !== -1) {
            let depth = 0;
            let dmEndIndex = -1;

            // Start scanning from the tag start
            for (let i = dmStartIndex; i < originalResponse.length; i++) {
                if (originalResponse[i] === '[') depth++;
                else if (originalResponse[i] === ']') depth--;

                if (depth === 0) {
                    dmEndIndex = i;
                    break;
                }
            }

            if (dmEndIndex !== -1) {
                const fullTag = originalResponse.substring(dmStartIndex, dmEndIndex + 1);
                // Content inside [dm: ... ]
                const content = originalResponse.substring(dmStartIndex + 4, dmEndIndex);

                // Split by first colon to get Name:Message
                const firstColon = content.indexOf(':');
                if (firstColon !== -1) {
                    const targetName = content.substring(0, firstColon).trim();
                    const messageContent = content.substring(firstColon + 1).trim();

                    console.log(`[Pipeline] AI wants to DM "${targetName}": "${messageContent}"`);

                    const targetUser = memory.findUserByName(targetName);
                    if (targetUser) {
                        console.log(`[Pipeline] Resolved "${targetName}" to User ID: ${targetUser.id}`);
                        dmAction = {
                            userId: targetUser.id,
                            message: messageContent
                        };
                    } else {
                        console.warn(`[Pipeline] Could not find user "${targetName}" for DM.`);
                    }
                }

                // Remove DM tag from spoken response
                spokenResponse = spokenResponse.replace(fullTag, '').trim();
            }
        }

        // Memory learn (clean text)
        const historyForLearning = history.get(context.userId);
        memory.learnFromInteraction(context.userId, query, spokenResponse, historyForLearning);

        // Update History (Add AI Response)
        history.add(context.userId, 'assistant', spokenResponse, 'Mina');

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
