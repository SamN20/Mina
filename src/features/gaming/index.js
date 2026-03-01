const store = require('./store');
const mood = require('../mood');
const audio = require('../../integrations/discord/audio');
const ai = require('../../integrations/ai');
const history = require('../../core/history');
const autoConversation = require('../auto_conversation');

// Load commands
require('./commands');

// Cooldown to prevent spamming comments about the same game
const commentCooldowns = new Map(); // userId-game -> timestamp
const COOLDOWN_TIME = 60 * 60 * 1000; // 1 hour

async function handlePresenceUpdate(oldPresence, newPresence) {
    if (!newPresence || !newPresence.member) return;

    const userId = newPresence.userId;
    const username = newPresence.member.displayName;

    // Check for activities
    const activities = newPresence.activities;
    if (!activities || activities.length === 0) return;

    // Look for games (ActivityType.Playing = 0)
    const game = activities.find(a => a.type === 0);
    if (!game) return;

    const gameName = game.name;

    // Record it
    store.recordGameActivity(userId, username, gameName);

    // Check if they were already playing this game (prevent comments on status updates)
    if (oldPresence) {
        const oldGame = oldPresence.activities.find(a => a.name === gameName);
        if (oldGame) return; // Already playing, just an update
    }

    // --- "Backseat Gamer" Logic ---
    // Only comment if:
    // 1. Mina is in a voice channel with this user
    // 2. Cooldown has passed

    const memberVoiceChannel = newPresence.member.voice.channel;
    if (!memberVoiceChannel) return; // User not in voice

    // Check if Mina is in the same channel
    const connection = audio.getConnection(newPresence.guild.id);
    if (!connection || connection.joinConfig.channelId !== memberVoiceChannel.id) return;

    // Check Cooldown
    const cooldownKey = `${userId}-${gameName}`;
    const lastComment = commentCooldowns.get(cooldownKey) || 0;
    if (Date.now() - lastComment < COOLDOWN_TIME) return;

    // Trigger Comment
    console.log(`[Gaming] Noticed ${username} playing ${gameName}. Generating comment...`);
    commentCooldowns.set(cooldownKey, Date.now());

    // Generate AI Comment
    const currentMood = mood.getMood();
    const prompt = `
You are hanging out in a voice chat.
Your friend ${username} just started playing "${gameName}".
Your current mood is: ${currentMood.description} (Tilt: ${currentMood.level}%).

[Instructions]
- Make a short comment about the game they are playing.
- If you hate the game (like Call of Duty/League), roast them.
- If you like the game (Minecraft/Coding/Indie), praise them.
- If you are Tilted/Angry, be mean about it.
- Keep it under 2 sentences.
- Don't be too repetitive.
`;

    try {
        const response = await ai.generateResponse(prompt);
        if (response) {
            // Use Parser
            const parser = require('../../core/ai/parser');
            const parsed = parser.parseResponse(response);

            // Log thought
            if (parsed.thoughts) console.log(`[Gaming Thought] ${parsed.thoughts}`);

            // Apply mood
            if (parsed.actions.tilt !== null) mood.modifyTilt(parsed.actions.tilt);

            let spoken = parsed.spokenText;

            // Speak it
            audio.speak(newPresence.guild.id, spoken);

            // Record in History and Buffer so she remembers it
            // We save the raw response (with thoughts/tags) to history so she learns from it properly?
            // Actually, for history, we usually save what was said + actions.
            // Let's align with handleUtterance: save RAW response.
            history.add(userId, 'assistant', response, 'Mina', { contextType: 'gaming' }); // Save RAW to history
            autoConversation.injectBotMessage(newPresence.guild.id, spoken); // Inject CLEAN to autoconvo buffer
        }
    } catch (e) {
        console.error('[Gaming] Error generating comment:', e);
    }
}

module.exports = {
    handlePresenceUpdate
};
