const mappings = require('./mappings');

// Configuration
const REACTION_CHANCE = 0.4; // 40% chance to react if a keyword is found
const COOLDOWN_TIME = 30 * 1000; // 30 seconds per user
const userCooldowns = new Map();

/**
 * Handle a new message and potentially react to it
 * @param {Message} message - Discord Message object
 */
async function handleMessage(message) {
    // Ignore bots and self
    if (message.author.bot) return;

    // Check Cooldown
    const userId = message.author.id;
    const lastReact = userCooldowns.get(userId) || 0;
    if (Date.now() - lastReact < COOLDOWN_TIME) return;

    // Check Probability (Global "don't be annoying" check)
    // We do this BEFORE processing to save CPU, but if we want to ensure
    // we only roll for valid messages, we should do it after finding keywords.
    // Let's do it AFTER finding keywords so we don't miss "rare" triggers,
    // but we can adjust the chance based on the keyword strength if we wanted.
    // For now, simple flat chance.
    if (Math.random() > REACTION_CHANCE) return;

    const text = message.content.toLowerCase();
    const foundKeywords = [];

    // Find all matching keywords in the text
    // We use word boundary regex to avoid matching "ass" in "class"
    for (const keyword of Object.keys(mappings)) {
        // Escape special regex chars if any (simple keywords usually don't have them)
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) {
            foundKeywords.push(keyword);
        }
    }

    if (foundKeywords.length === 0) return;

    // Pick a random keyword from the ones found
    const chosenKeyword = foundKeywords[Math.floor(Math.random() * foundKeywords.length)];
    const possibleEmojis = mappings[chosenKeyword];
    
    // Pick a random emoji for that keyword
    const emoji = possibleEmojis[Math.floor(Math.random() * possibleEmojis.length)];

    try {
        await message.react(emoji);
        console.log(`[Reactions] Reacted with ${emoji} to "${message.content}" (Keyword: ${chosenKeyword})`);
        
        // Set Cooldown
        userCooldowns.set(userId, Date.now());
    } catch (error) {
        console.error(`[Reactions] Failed to react:`, error);
    }
}

module.exports = {
    handleMessage
};
