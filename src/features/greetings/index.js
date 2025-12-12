const audio = require('../../integrations/discord/audio');
const memory = require('../../core/memory');
const ai = require('../../integrations/ai');
const storage = require('../../core/storage');

const lastGreetingTime = new Map();
const GREETING_COOLDOWN = 20 * 60 * 1000; // 20 Minutes

/**
 * Greet a new user joining the channel
 * @param {string} guildId 
 * @param {string} userId 
 * @param {import('discord.js').GuildMember} member 
 */
async function greetNewUser(guildId, userId, member) {
    console.log(`[Greeting] Checking greeting for ${userId} in ${guildId}`);

    if (!audio.getConnection(guildId)) {
        console.log(`[Greeting] No active connection for guild ${guildId}`);
        return;
    }

    if (storage.isOptedOut(userId)) {
        console.log(`[Greeting] User ${userId} opt-out`);
        return;
    }

    // Cooldown Check
    const now = Date.now();
    const last = lastGreetingTime.get(userId) || 0;
    if (now - last < GREETING_COOLDOWN) {
        console.log(`[Greeting] Skipping greeting for ${userId} (Cooldown active)`);
        return;
    }
    lastGreetingTime.set(userId, now);

    try {
        const profile = memory.getProfileData(userId);
        const name = profile.displayName || member.displayName;
        const facts = profile.facts.slice(0, 3).join(', ');

        const prompt = `
A user named "${name}" just joined the voice call where you are present.
User Facts: ${facts}

[Instructions]
- Say hello to them personally.
- Keep it VERY SHORT (1 sentence).
- MANDATORY: Mention that "voice transcription is on" or "recording is active".

Generate the spoken greeting:
`;
        const greeting = await ai.generateResponse(prompt);
        if (greeting) {
            console.log(`[User Join Greeting] "${greeting}"`);
            audio.speak(guildId, greeting);
        } else {
            audio.speak(guildId, `Hello ${name}, voice transcription is active.`);
        }
    } catch (e) {
        console.error("User join greeting failed:", e);
        // Fallback is crucial for consent warning
        audio.speak(guildId, `Hello ${member.displayName}, voice transcription is active.`);
    }
}

/**
 * Greet everyone when the bot joins
 * @param {import('discord.js').VoiceChannel} channel 
 * @param {boolean} isSilent 
 */
async function greetGroupOnJoin(channel, isSilent = false) {
    if (isSilent) {
        audio.speak(channel.guild.id, "Voice transcription is now active.");
        return;
    }

    try {
        // Get Members
        const members = channel.members.filter(m => !m.user.bot);
        const presentUsers = [];

        for (const [id, member] of members) {
            if (!storage.isOptedOut(id)) {
                const profile = memory.getProfileData(id);
                presentUsers.push({
                    name: profile.displayName || member.displayName,
                    facts: profile.facts.slice(0, 5)
                });
            }
        }

        // Build Prompt
        const userContexts = presentUsers.map(u =>
            `- ${u.name}: ${u.facts.join(', ')}`
        ).join('\n');

        const count = presentUsers.length;
        const instructions = count > 3
            ? "Greet the group generally. Briefly mention 1-2 key people if relevant."
            : "Greet everyone individually by name. Be friendly and personalized based on their facts.";

        const prompt = `
You have just joined a voice channel named "${channel.name}".
People present (${count}):
${userContexts}

[Instructions]
- ${instructions}
- Keep it VERY SHORT (under 2 sentences).
- MANDATORY: End with this exact phrase: "By the way, voice transcription is now active."

Generate the spoken greeting:
`;

        const greeting = await ai.generateResponse(prompt);
        if (greeting) {
            console.log(`[Join Greeting] "${greeting}"`);
            audio.speak(channel.guild.id, greeting);
        } else {
            audio.speak(channel.guild.id, "Hello everyone! Voice transcription is now active.");
        }

    } catch (e) {
        console.error("Greeting failed:", e);
        audio.speak(channel.guild.id, "Hello! Voice transcription is now active.");
    }
}

module.exports = {
    greetNewUser,
    greetGroupOnJoin
};
