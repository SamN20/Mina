const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Model Configuration with Fallback Chain
const MODELS = [
    'gemini-2.5-flash',       // Primary: Smart, 5 RPM
    'gemini-2.5-flash-lite',  // Backup 1: Fast, 10 RPM
    'gemini-1.5-flash'        // Backup 2: Reliable Legacy
];

let genAI = null;

function init() {
    if (process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    } else {
        console.warn("[Gemini] No API Key provided (GEMINI_API_KEY). AI features disabled.");
    }
}

async function generateResponse(prompt) {
    if (!genAI) init();
    if (!genAI) return "I cannot think right now. My API key is missing.";

    // Load Personality
    let systemInstruction = "";
    try {
        const configPath = path.join(__dirname, '../ai_config.txt');
        if (fs.existsSync(configPath)) {
            systemInstruction = fs.readFileSync(configPath, 'utf8');
        }
    } catch (e) {
        console.warn("[Gemini] Failed to load ai_config.txt", e);
    }

    // Construct full prompt
    const fullPrompt = `${systemInstruction}\n\nUser: ${prompt}\n\nResponse (Keep it short and casual, under 2 sentences):`;

    for (const modelName of MODELS) {
        try {
            console.log(`[Gemini] Thinking with ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });

            // Generate content
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            if (text) {
                console.log(`[Gemini] Success with ${modelName}`);
                return text;
            }
        } catch (error) {
            console.error(`[Gemini] Error with ${modelName}: ${error.message}`);
        }
    }

    return "I am overworked and cannot answer right now. Please try again later.";
}

module.exports = { generateResponse };
