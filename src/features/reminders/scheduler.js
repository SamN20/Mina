const { VoiceConnectionStatus } = require('@discordjs/voice');
const reminders = require('./store'); // Same directory now
const memory = require('../../core/memory');
const audio = require('../../integrations/discord/audio');

/**
 * Schedule a reminder to fire
 * @param {import('discord.js').Client} client 
 * @param {string} guildId 
 * @param {string} userId 
 * @param {Object} reminder 
 */
function scheduleReminder(client, guildId, userId, reminder) {
    const remindAt = new Date(reminder.remindAt);
    const now = new Date();
    const delay = remindAt - now;

    if (delay <= 0) return;

    console.log(`[Scheduler] Scheduling reminder ${reminder.id} for ${delay}ms from now`);

    setTimeout(async () => {
        // Personalize Message
        const profile = memory.getProfileData(userId);
        const name = profile && profile.displayName ? profile.displayName : null;
        const reminderMessage = name
            ? `Reminder for ${name}: ${reminder.message}`
            : `Reminder: ${reminder.message}`;

        const guild = client.guilds.cache.get(guildId);

        // DM Fallback if guild not found
        if (!guild) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) await user.send(`🔔 ${reminderMessage}`);
            reminders.removeReminder(reminder.id);
            return;
        }

        const member = await guild.members.fetch(userId).catch(() => null);

        // Decision: Voice or DM?
        if (member && member.voice.channel) {
            const targetChannel = member.voice.channel;
            const conn = audio.getConnection(guildId);

            // Check if we are ALREADY in the SAME channel
            const isAlreadyInChannel = conn &&
                conn.state.status !== VoiceConnectionStatus.Destroyed &&
                conn.joinConfig.channelId === targetChannel.id;

            if (isAlreadyInChannel) {
                console.log(`[Scheduler] Already in ${targetChannel.name}. Speaking reminder.`);
                audio.speak(guildId, reminderMessage);
            } else {
                console.log(`[Scheduler] Joining ${targetChannel.name} to announce.`);
                try {
                    audio.join(targetChannel);
                    // Wait slightly for connection
                    await new Promise(r => setTimeout(r, 500));

                    // Speak and wait for finish
                    await audio.speak(guildId, reminderMessage);

                    // Leave after speaking since we joined specifically for this
                    console.log(`[Scheduler] Announcement done. Leaving.`);
                    audio.leave(guildId);
                } catch (e) {
                    console.error("[Scheduler] Failed to join/speak:", e);
                    await member.send(`🔔 ${reminderMessage}`);
                }
            }
        } else {
            // Not in voice, DM user
            console.log(`[Scheduler] User not in voice, sending DM.`);
            if (member) await member.send(`🔔 ${reminderMessage}`);
            else {
                // Member not found in guild? Try fetching user directly
                const user = await client.users.fetch(userId).catch(() => null);
                if (user) await user.send(`🔔 ${reminderMessage}`);
            }
        }

        reminders.removeReminder(reminder.id);

    }, delay);
}

module.exports = {
    scheduleReminder
};
