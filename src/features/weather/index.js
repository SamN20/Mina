const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const weatherApi = require('./api');

registry.register({
    id: 'WEATHER',
    patterns: [
        'weather in (.*)',
        'what\'s the weather in (.*)',
        'check the weather for (.*)',
        'weather for (.*)',
        'do I need an umbrella'
    ],
    execute: async (text, context, matches) => {
        let location = matches ? matches[1] : null;

        // Handle "do I need an umbrella" without location
        if (!location && text.includes('umbrella')) {
            return { [ActionType.TTS_SPEAK]: "I need to know which city you are in to check the weather." };
        }

        if (!location) {
            return { [ActionType.TTS_SPEAK]: "Where should I check the weather for?" };
        }

        location = location.replace(/[?!.]/g, '').trim();

        try {
            const report = await weatherApi.getWeather(location);

            // Umbrella specific logic (re-implemented simply or just return report)
            // The original had specific "Yes/No" logic for umbrella.
            // Let's preserve that if possible by parsing the report or just appending context?
            // Actually, for simplicity and since the API returns a string, let's just return the report.
            // If the user asked specifically about an umbrella, the rain chance in the report is sufficient context.

            // Optionally, we can check if report includes "rain" or "drizzling" or high chance.
            if (text.includes('umbrella')) {
                const isRaining = report.toLowerCase().includes('rain') || report.toLowerCase().includes('drizzling') || report.toLowerCase().includes('stormy');
                const rainChance = report.match(/Rain chance: (\d+)%/);
                const prob = rainChance ? parseInt(rainChance[1]) : 0;

                if (isRaining || prob > 40) {
                    return { [ActionType.TTS_SPEAK]: `${report} You probably need an umbrella.` };
                } else {
                    return { [ActionType.TTS_SPEAK]: `${report} You technically don't need one, but better safe than sorry?` };
                }
            }

            return { [ActionType.TTS_SPEAK]: report };

        } catch (e) {
            console.error("Weather Error:", e);
            return { [ActionType.TTS_SPEAK]: `Sorry, I couldn't get the weather for ${location}.` };
        }
    }
});
