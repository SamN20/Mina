const weatherApi = require('../features/weather/api');

module.exports = {
    definition: {
        type: 'function',
        function: {
            name: 'get_weather',
            description: 'Get current weather forecast for a specific city or location.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        type: 'string',
                        description: 'The city or location to check weather for (e.g. "Tokyo", "London, UK")'
                    }
                },
                required: ['location']
            }
        }
    },
    execute: async ({ location }) => {
        try {
            return await weatherApi.getWeather(location);
        } catch (e) {
            return `Failed to get weather for ${location}: ${e.message}`;
        }
    }
};
