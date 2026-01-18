const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const dndStore = require('./store');
const audio = require('../../integrations/discord/audio');

registry.register({
    id: 'DND_TOGGLE',
    title: 'Toggle Do Not Disturb',
    description: 'Adds or removes [DND] from the voice channel name',
    canDisable: true,
    patterns: [
        'turn on do not disturb',
        'turn off do not disturb',
        'toggle do not disturb',
        'do not disturb'
    ],
    execute: async (text, context, matches) => {
        const guildId = context.guildId;
        const member = context.member;

        if (!member || !member.voice.channel) {
            return { [ActionType.TTS_SPEAK]: "You need to be in a voice channel to use Do Not Disturb." };
        }

        const channel = member.voice.channel;

        // Check permissions
        const botMember = channel.guild.members.cache.get(context.client.user.id);
        if (!botMember.permissionsIn(channel).has('ManageChannels')) {
            return { [ActionType.TTS_SPEAK]: "I don't have permission to change the channel name." };
        }


        // Fetch fresh channel to avoid stale cache issues
        let targetChannel;
        try {
            targetChannel = await context.client.channels.fetch(member.voice.channel.id);
        } catch (e) {
            targetChannel = member.voice.channel;
        }

        const currentName = targetChannel.name;
        const hasDND = currentName.startsWith('[DND] ');

        // Determine intent
        const wantsOff = /\b(off|remove|disable)\b/i.test(text);
        const wantsOn = /\b(on|enable|start)\b/i.test(text);

        let newName = currentName;
        let actionTaken = '';

        try {
            if (hasDND) {
                if (wantsOn) {
                    return { [ActionType.TTS_SPEAK]: "Do Not Disturb is already on." };
                }
                // Turn OFF
                newName = currentName.substring(6); // Remove "[DND] "
                console.log(`[DND] Removing tag. New name: "${newName}"`);

                // Use a non-hanging promise just in case it's rate limited and discord.js waits
                const renamePromise = targetChannel.setName(newName);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));

                await Promise.race([renamePromise, timeoutPromise]);

                dndStore.removeDND(targetChannel.id);
                actionTaken = 'off';
            } else {
                if (wantsOff) {
                    return { [ActionType.TTS_SPEAK]: "Do Not Disturb is not on." };
                }
                // Turn ON
                newName = `[DND] ${currentName}`;
                console.log(`[DND] Adding tag. New name: "${newName}"`);

                const renamePromise = targetChannel.setName(newName);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));

                await Promise.race([renamePromise, timeoutPromise]);

                dndStore.setDND(targetChannel.id, member.id);
                actionTaken = 'on';
            }
        } catch (error) {
            console.error('[DND] Error changing channel name:', error);

            if (error.message === 'TIMEOUT') {
                return { [ActionType.TTS_SPEAK]: "Discord is rate limiting channel name changes. Please try again in 10 minutes." };
            }
            if (error.code === 50013) {
                return { [ActionType.TTS_SPEAK]: "I don't have permission to rename this channel." };
            }
            if (error.status === 429) { // Rate limit
                return { [ActionType.TTS_SPEAK]: "I'm changing channel names too fast. Please wait a moment." };
            }
            return { [ActionType.TTS_SPEAK]: "I encountered an error trying to change the channel name." };
        }

        const response = actionTaken === 'on'
            ? "Do Not Disturb is now on. I'll remove the tag when you leave."
            : "Do Not Disturb is now off.";

        return {
            [ActionType.TTS_SPEAK]: response
        };
    }
});
