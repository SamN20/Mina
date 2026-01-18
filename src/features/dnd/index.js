const dndStore = require('./store');
require('./commands'); // Register commands

/**
 * Check if we need to remove DND tag when a user leaves
 * @param {import('discord.js').VoiceState} oldState 
 */
async function checkCleanup(oldState) {
    // If user wasn't in a channel, ignore
    if (!oldState.channelId) return;

    const channelId = oldState.channelId;
    const ownerId = dndStore.getDNDOwner(channelId);

    // If this channel isn't in DND mode, ignore
    if (!ownerId) return;

    // Check if the user who left is the owner
    if (oldState.member.id === ownerId) {
        const channel = oldState.channel;
        // Channel might be deleted
        if (!channel) {
            dndStore.removeDND(channelId);
            return;
        }

        // Remove [DND] tag
        if (channel.name.startsWith('[DND] ')) {
            const newName = channel.name.substring(6);
            try {
                await channel.setName(newName);
                console.log(`[DND] Removed DND tag from ${channel.name} because owner ${oldState.member.displayName} left.`);
            } catch (error) {
                console.error(`[DND] Failed to revert channel name:`, error);
            }
        }

        // Remove from store regardless of rename success (to prevent stuck state)
        dndStore.removeDND(channelId);
    }
}

module.exports = {
    checkCleanup
};
