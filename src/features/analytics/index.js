const store = require('./store');
const coreStorage = require('../../core/storage');
const wrapped = require('../wrapped/store');

const SCAN_INTERVAL = 60 * 1000; // 1 minute

function init(client) {
    console.log('[Analytics] Initializing activity tracking...');
    
    // Start Polling Loop
    setInterval(() => scanActivity(client), SCAN_INTERVAL);
}

function trackMessage(message) {
    if (message.author.bot) return;
    if (coreStorage.isOptedOut(message.author.id)) return;
    store.updateActivity(message.author.id, 'msg', 1);
    // Wrapped: increment per-user/server/channel message counters
    try { wrapped.incrMessage(message.author.id, message.guild ? message.guild.id : null, message.channel.id, 1); } catch (e) { }
    // We can save immediately for messages since they are sporadic
    store.saveAll();
}

async function scanActivity(client) {
    // console.log('[Analytics] Scanning activity...');
    
    for (const guild of client.guilds.cache.values()) {
        // We need to fetch members to get presence? 
        // Usually cache is enough if presences intent is on.
        
        // 1. Group Voice Members by Channel
        const voiceChannels = new Map(); // channelId -> [userIds]

        for (const member of guild.members.cache.values()) {
            if (member.user.bot) continue;

            const userId = member.id;

            if (coreStorage.isOptedOut(userId)) continue; // Skip opted-out users

            // Track Status (Online/Idle/DnD)
            // Note: member.presence might be null if offline or not cached
            if (member.presence && ['online', 'idle', 'dnd'].includes(member.presence.status)) {
                store.updateActivity(userId, 'online', 1);
            }

            // Track Voice
            if (member.voice.channelId) {
                store.updateActivity(userId, 'voice', 1);

                // Add to channel group for social graph
                if (!voiceChannels.has(member.voice.channelId)) {
                    voiceChannels.set(member.voice.channelId, []);
                }
                voiceChannels.get(member.voice.channelId).push(userId);
            }
        }

        // 2. Update Social Graph (Pairs)
        for (const [channelId, userIds] of voiceChannels) {
            if (userIds.length < 2) continue; // Alone

            // Create all unique pairs
            for (let i = 0; i < userIds.length; i++) {
                for (let j = i + 1; j < userIds.length; j++) {
                    store.updateRelationship(userIds[i], userIds[j], 1);
                }
            }
        }
    }

    // Save changes to disk
    store.saveAll();
}

module.exports = {
    init,
    trackMessage
};
