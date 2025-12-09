const gemini = require('./gemini');
const openrouter = require('./openrouter');

async function generateResponse(prompt) {
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (provider === 'openrouter') {
        return await openrouter.generateResponse(prompt);
    } else {
        // Default to Gemini
        return await gemini.generateResponse(prompt);
    }
}

module.exports = { generateResponse };
