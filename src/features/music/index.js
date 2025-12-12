const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const intentClassifier = require('../../core/nlu/classifier');
const intentParser = require('../../core/nlu/parser');
const satelliteServer = require('../../integrations/satellite');
// We should wrap this later

registry.register({
    id: 'MUSIC_CONTROL',
    matcher: (text) => {
        const classification = intentClassifier.classifyIntent(text);
        return classification.intent === 'music' && classification.confidence > 0.6;
    },
    execute: async (text, context) => {
        // Parse specific intent (Play, Pause, etc.)
        const intent = intentParser.parseIntent(text);

        if (!intent) {
            // Intent classifier said music, but parser couldn't figure it out?
            // Fallback to generic or fail?
            return {
                [ActionType.TTS_SPEAK]: "I'm not sure what you want me to do with the music."
            };
        }

        if (intent.type === 'MEDIA_INFO') {
            // This requires querying satellite and waiting
            try {
                const info = await satelliteServer.query(context.userId, 'MEDIA_INFO');
                if (info && info.title) {
                    const artist = info.artist ? `by ${info.artist} ` : '';
                    return {
                        [ActionType.TTS_SPEAK]: `Playing ${info.title} ${artist}.`
                    };
                } else {
                    return {
                        [ActionType.TTS_SPEAK]: "I can't tell what's playing right now."
                    };
                }
            } catch (e) {
                return { [ActionType.TTS_SPEAK]: "Could not contact media player." };
            }
        }

        // Standard Command
        return {
            [ActionType.SATELLITE_CMD]: {
                command: intent.type
            },
            [ActionType.TTS_SPEAK]: "Done."
        };
    }
});
