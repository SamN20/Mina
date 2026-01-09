const audio = require('../../integrations/discord/audio');
const memory = require('../../core/memory');
const ai = require('../../integrations/ai');
const storage = require('../../core/storage');

const lastGreetingTime = new Map();
const GREETING_COOLDOWN = 20 * 60 * 1000; // 20 Minutes

const parser = require('../../core/ai/parser');

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
        const facts = (profile.memories || [])
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 3)
            .map(m => m.text)
            .join(', ');

        const prompt = `
A user named "${name}" just joined the voice call where you are present.
User Facts: ${facts}

[Instructions]
- Say hello to them personally.
- Keep it VERY SHORT (1 sentence).
- MANDATORY: Mention that "voice transcription is on" or "recording is active".

Generate the spoken greeting:
`;
        const output = await ai.generateResponse(prompt);
        if (output) {
            const parsed = parser.parseResponse(output);
            console.log(`[User Join Greeting] Thoughts: ${parsed.thoughts}`);
            console.log(`[User Join Greeting] Spoken: "${parsed.spokenText}"`);
            audio.speak(guildId, parsed.spokenText);
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
                    facts: (profile.memories || [])
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                        .slice(0, 5)
                        .map(m => m.text)
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
- MANDATORY: End with this phrase: "voice transcription is now active."

Generate the spoken greeting:
`;

        const output = await ai.generateResponse(prompt);
        if (output) {
            const parsed = parser.parseResponse(output);
            console.log(`[Join Greeting] Thoughts: ${parsed.thoughts}`);
            console.log(`[Join Greeting] Spoken: "${parsed.spokenText}"`);
            audio.speak(channel.guild.id, parsed.spokenText);
        } else {
            audio.speak(channel.guild.id, "Hello everyone! Voice transcription is now active.");
        }

    } catch (e) {
        console.error("Greeting failed:", e);
        audio.speak(channel.guild.id, "Hello! Voice transcription is now active.");
    }
}

/**
 * Generate a greeting string for a user (Non-speaking, for Ghost Mode)
 * @param {import('discord.js').GuildMember} member 
 * @param {import('discord.js').VoiceChannel} channel 
 */
async function generateGreeting(member, channel) {
    if (!member) return null;
    const userId = member.id;

    if (storage.isOptedOut(userId)) return null;

    try {
        const profile = memory.getProfileData(userId);
        const name = profile.displayName || member.displayName;
        const facts = (profile.memories || [])
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 3)
            .map(m => m.text)
            .join(', ');

        const prompt = `
A user named "${name}" joined "${channel.name}".
User Facts: ${facts}

[Instructions]
- Briefly say hello.
- Keep it under 2 sentences.
- Mention "transcription is active" lightly.

Generate greeting:
`;
        const output = await ai.generateResponse(prompt);
        if (output) {
            const parsed = parser.parseResponse(output);
            return parsed.spokenText;
        }
        return `Hello ${name}, recording is active.`;

    } catch (e) {
        console.error("Generate greeting failed:", e);
        return `Hello ${member.displayName}, recording is active.`;
    }
}

module.exports = {
    greetNewUser,
    greetGroupOnJoin,
    generateGreeting
};
