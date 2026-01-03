const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const mood = require('../mood');

// Rage Quit Command
registry.register({
    id: 'RAGE_QUIT',
    patterns: [
        'rage quit',
        'leave now',
        'get out',
        'go away',
        'i hate you'
    ],
    execute: async (text, context) => {
        // Max out tilt
        mood.updateMood('bad bot bad bot bad bot'); 
        
        return {
            [ActionType.TTS_SPEAK]: "[angry] Fine! I'm leaving! This team is trash anyway!",
            [ActionType.LEAVE]: true,
            metadata: {
                newStatus: "Rage Quit"
            }
        };
    }
});

