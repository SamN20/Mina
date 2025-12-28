const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const fs = require('fs');
const path = require('path');

registry.register({
    id: 'SOUNDBOARD',
    patterns: [
        'play sound (.*)',
        'play effect (.*)',
        'play the (.*) sound',
        'play sfx (.*)'
    ],
    execute: async (text, context, matches) => {
        const soundName = matches[1].trim().toLowerCase();
        const soundsDir = path.join(process.cwd(), 'data', 'sounds');
        
        if (!fs.existsSync(soundsDir)) {
            return { [ActionType.TTS_SPEAK]: "I don't have any sounds loaded." };
        }

        const files = fs.readdirSync(soundsDir);
        
        // 1. Exact match (minus extension)
        let match = files.find(f => {
            const name = path.parse(f).name.toLowerCase();
            return name === soundName;
        });

        // 2. Starts with match
        if (!match) {
            match = files.find(f => f.toLowerCase().startsWith(soundName));
        }

        // 3. Contains match
        if (!match) {
            match = files.find(f => f.toLowerCase().includes(soundName));
        }

        if (match) {
            return {
                [ActionType.PLAY_FILE]: path.join(soundsDir, match)
            };
        }

        return {
            [ActionType.TTS_SPEAK]: `I couldn't find a sound for ${soundName}.`
        };
    }
});
