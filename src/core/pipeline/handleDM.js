const ai = require('../../integrations/ai');
const memory = require('../memory');
const history = require('../history');
const soundboard = require('../../features/soundboard/utils');
const vision = require('../../features/vision/api');

// Admin IDs from env
const ADMIN_IDS = (process.env.ADMIN_IDS || '478317556038369285').split(',');

/**
 * Handle a DM message
 * @param {string} text 
 * @param {import('discord.js').User} user 
 * @param {import('discord.js').Message} [message] - Optional message object for attachments
 * @returns {Promise<string|null>} Response text or null if ignored
 */
async function handleDM(text, user, message = null) {
    const userId = user.id;
    const username = user.username; // Or global name if available?

    // 1. Permission Check
    const isExpecting = memory.isExpectingDM(userId);
    const isAdmin = ADMIN_IDS.includes(userId);

    if (!isExpecting && !isAdmin) {
        console.log(`[DM Pipeline] Ignoring DM from ${username} (${userId}) - Not expected & not admin.`);
        return null;
    }

    // Resolve Name from Memory (if exists)
    const profile = memory.getProfileData(userId);
    const displayName = profile.displayName || username;

    console.log(`[DM Pipeline] Handling DM from "${displayName}" (${username}): "${text}"`);

    // FEATURE: Vision Integration
    if (message && message.attachments.size > 0) {
        const firstAttachment = message.attachments.first();
        if (firstAttachment.contentType && firstAttachment.contentType.startsWith('image/')) {
            console.log(`[DM Pipeline] Image detected. Analyzing...`);
            const description = await vision.analyzeImage(firstAttachment.url);
            text += `\n[Image Attachment: ${description}]`;
            // Phase 1.5: Store vision memory
            await vision.storeVisionMemory(userId, firstAttachment.url, description, displayName);
        }
    }

    // 2. Build Context
    // We reuse memory context logic
    const context = await memory.getContext(userId, displayName, text);

    // 3. Prompt Construction
    // Include Mood and Status context similar to voice pipeline
    const mood = require('../../features/mood');
    const currentMood = mood.getMood();
    // We don't have 'currentStatus' passed in easily from index.js msg, but likely not critical.
    // We can infer it's "Messaging".
    const fullPrompt = `${context}\n[Context: Direct Message Chat]\n[Your Mood: ${currentMood.description} (Tilt: ${currentMood.level}%)]\nUser: ${text}`;

    // 4. Update History (User)
    // Use the RESOLVED display name
    history.add(userId, 'user', text, displayName);

    // 5. Generate Response
    const historyWindow = history.get(userId);
    const response = await ai.generateResponse(fullPrompt, historyWindow);

    if (!response) return null;

    console.log(`[DM Pipeline] AI Response: "${response}"`);

    // 6. Cleanup Response using Shared Parser
    const parser = require('../ai/parser');
    const parsed = parser.parseResponse(response);

    // Log Thoughts (but don't send)
    if (parsed.thoughts) {
        console.log(`\n-----[DM Thoughts]-----\n${parsed.thoughts}\n-----`);
    }

    // Apply Mood Tilt (DMs can affect mood too)
    if (parsed.actions.tilt !== null) {
        mood.modifyTilt(parsed.actions.tilt);
    }

    // Strip tags and use clean text
    let cleanResponse = parsed.spokenText;

    // If response contains only internal thoughts or is empty after cleaning, do not send.
    if (!cleanResponse || cleanResponse.trim().length === 0) {
        console.log('[DM Pipeline] Response was empty after stripping thoughts/tags — not sending.');
        // Still update history and learning as before, but return null to avoid posting to Discord.
        return null;
    }

    // 7. Update History (AI)
    // Save RAW response to maintain consistency
    history.add(userId, 'assistant', response, 'Mina');

    // 8. Learning
    const historyForLearning = history.get(userId);
    // Include thoughts in learning!
    memory.learnFromInteraction(userId, text, cleanResponse, historyForLearning, parsed.thoughts);

    // 9. Consume Permission (if not Admin)
    if (!isAdmin) {
        memory.setExpectingDM(userId, false);
    } else {
        // For Admin, we keep it open? Or do we rely on "always allowed" check?
        // We rely on isAdmin check above, so strictly speaking setExpectingDM(false) wouldn't stop admin.
        // But let's set it false just to keep state clean.
        memory.setExpectingDM(userId, false);
    }

    return cleanResponse;
}

module.exports = { handleDM };
