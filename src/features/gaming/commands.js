const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const store = require('./store');
const audio = require('../../integrations/discord/audio');
const memory = require('../../core/memory');

// Squad Finder Command
registry.register({
    id: 'SQUAD_FINDER',
    title: 'Squad Finder',
    description: 'Finds users who play a specific game',
    canDisable: true,
    patterns: [
        'who plays (.*)',
        'does anyone play (.*)',
        'find players for (.*)'
    ],
    execute: async (text, context, matches) => {
        const gameQuery = matches[1].trim().toLowerCase();
        const allStats = store.getAllStats();
        
        const players = [];
        
        for (const [userId, data] of Object.entries(allStats)) {
            if (!data.games) continue;
            
            // Find matching game
            const gameName = Object.keys(data.games).find(g => g.toLowerCase().includes(gameQuery));
            
            if (gameName) {
                const stats = data.games[gameName];
                // Only count if played recently (last 30 days) or played a lot (> 5 times)
                const isRecent = (Date.now() - stats.lastSeen) < (30 * 24 * 60 * 60 * 1000);
                if (isRecent || stats.timesSeen > 5) {
                    const profile = memory.getProfileData(userId);
                    const name = (profile && profile.displayName) ? profile.displayName : data.username;
                    players.push(name);
                }
            }
        }

        if (players.length === 0) {
            return {
                [ActionType.TTS_SPEAK]: `I haven't seen anyone play ${gameQuery} recently.`
            };
        }

        const playerList = players.join(', ');
        return {
            [ActionType.TTS_SPEAK]: `I've seen ${playerList} play ${gameQuery}.`
        };
    }
});

// Common Game Finder
registry.register({
    id: 'COMMON_GAME',
    title: 'Game Recommender',
    description: 'Suggests games based on who is in the voice channel',
    canDisable: true,
    patterns: [
        'what can we play',
        'find a game for us',
        'what games do we have in common',
        'suggest a game'
    ],
    execute: async (text, context) => {
        const guildId = context.guildId;
        const connection = audio.getConnection(guildId);
        
        if (!connection) {
            return { [ActionType.TTS_SPEAK]: "I need to be in a voice channel to see who is here." };
        }

        const channelId = connection.joinConfig.channelId;
        const channel = context.client.channels.cache.get(channelId);
        
        if (!channel) return { [ActionType.TTS_SPEAK]: "I can't find the channel." };

        // Get members in voice (excluding bots)
        const members = channel.members.filter(m => !m.user.bot);
        if (members.size < 2) {
            return { [ActionType.TTS_SPEAK]: "It's just you here. You can play whatever you want!" };
        }

        // Find common games
        const memberIds = members.map(m => m.id);
        const commonGames = store.findCommonGames(memberIds);

        if (commonGames.length === 0) {
            return { [ActionType.TTS_SPEAK]: "I couldn't find any games that most of you have played recently." };
        }

        // Pick top 3 and format response
        const suggestions = commonGames.slice(0, 3).map(g => {
            const isEveryone = g.count === members.size;
            
            if (isEveryone) {
                return `${g.name}`;
            } else {
                // Get real names from memory or fallback to discord name
                const playerNames = g.players.map(uid => {
                    const profile = memory.getProfileData(uid);
                    // Use profile name if available, otherwise find discord member
                    if (profile && profile.displayName) return profile.displayName;
                    
                    const member = members.find(m => m.id === uid);
                    return member ? member.displayName : "someone";
                });
                
                return `${g.name} (${playerNames.join(', ')} have played)`;
            }
        });

        return {
            [ActionType.TTS_SPEAK]: `You could play ${suggestions.join(', or ')}.`
        };
    }
});
