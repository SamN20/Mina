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

/**
 * Get weather for a location string
 * @param {string} location 
 * @returns {Promise<string>} Human readable weather report
 */
async function getWeather(location) {
    // 1. Geocoding
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const geoData = await fetchJson(geoUrl);

    if (!geoData.results || geoData.results.length === 0) {
        throw new Error(`Location not found: ${location}`);
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    // 2. Weather Data
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
    const weatherData = await fetchJson(weatherUrl);

    if (!weatherData.current) {
        throw new Error("Weather data unavailable");
    }

    const current = weatherData.current;
    const daily = weatherData.daily;

    // WMO Weather interpretation
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
    const rainProb = daily.precipitation_probability_max[0];
    const high = Math.round(daily.temperature_2m_max[0]);
    const low = Math.round(daily.temperature_2m_min[0]);

    let response = `In ${name}, it is currently ${condition} and ${temp}°C. `;
    response += `High: ${high}°C, Low: ${low}°C. `;

    if (rainProb > 0) {
        response += `Rain chance: ${rainProb}%.`;
    }

    return response;
}

module.exports = { getWeather };
