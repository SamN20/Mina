const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const https = require('https');

// Helper to fetch JSON
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

registry.register({
    id: 'WEATHER',
    patterns: [
        'weather in (.*)',
        'what\'s the weather in (.*)',
        'check the weather for (.*)',
        'weather for (.*)',
        'do I need an umbrella' // Special case, might need location context or default
    ],
    execute: async (text, context, matches) => {
        let location = matches ? matches[1] : null;

        // Handle "do I need an umbrella" without location
        if (!location && text.includes('umbrella')) {
            // TODO: Support default location in settings
            return { [ActionType.TTS_SPEAK]: "I need to know which city you are in to check the weather." };
        }
        
        if (!location) {
             return { [ActionType.TTS_SPEAK]: "Where should I check the weather for?" };
        }

        location = location.replace(/[?!.]/g, '').trim();

        try {
            // 1. Geocoding
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
            const geoData = await fetchJson(geoUrl);

            if (!geoData.results || geoData.results.length === 0) {
                return { [ActionType.TTS_SPEAK]: `I couldn't find a place named ${location}.` };
            }

            const { latitude, longitude, name, country } = geoData.results[0];

            // 2. Weather Data
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
            const weatherData = await fetchJson(weatherUrl);

            if (!weatherData.current) {
                return { [ActionType.TTS_SPEAK]: "I couldn't get the weather data right now." };
            }

            const current = weatherData.current;
            const daily = weatherData.daily;
            
            // WMO Weather interpretation
            // https://open-meteo.com/en/docs
            const code = current.weather_code;
            let condition = "clear";
            if (code === 0) condition = "clear sky";
            else if (code >= 1 && code <= 3) condition = "partly cloudy";
            else if (code >= 45 && code <= 48) condition = "foggy";
            else if (code >= 51 && code <= 55) condition = "drizzling";
            else if (code >= 61 && code <= 65) condition = "raining";
            else if (code >= 71 && code <= 77) condition = "snowing";
            else if (code >= 80 && code <= 82) condition = "raining heavily";
            else if (code >= 95) condition = "stormy";

            const temp = Math.round(current.temperature_2m);
            const wind = Math.round(current.wind_speed_10m);
            const rainProb = daily.precipitation_probability_max[0];

            let response = `In ${name}, it is currently ${condition} and ${temp} degrees. `;
            
            if (text.includes('umbrella')) {
                if (code >= 50 || rainProb > 50) {
                    response += "Yes, you should definitely take an umbrella.";
                } else {
                    response += "No, you probably won't need an umbrella.";
                }
            } else {
                response += `Expect a high of ${Math.round(daily.temperature_2m_max[0])} and a low of ${Math.round(daily.temperature_2m_min[0])}. `;
                if (rainProb > 0) {
                    response += `There is a ${rainProb}% chance of rain today.`;
                }
            }

            return { [ActionType.TTS_SPEAK]: response };

        } catch (e) {
            console.error("Weather Error:", e);
            return { [ActionType.TTS_SPEAK]: "Sorry, I had trouble checking the weather." };
        }
    }
});
