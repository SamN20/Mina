const gemini = require('./gemini');
const openrouter = require('./openrouter');

async function generateResponse(prompt, history = [], options = {}) {
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (provider === 'openrouter') {
        return await openrouter.generateResponse(prompt, history, options);
    } else {
        // Default to Gemini (No history support yet, so we ignore it)
        return await gemini.generateResponse(prompt);
    }
}

module.exports = { generateResponse };
