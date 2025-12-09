const fs = require('fs');
const path = require('path');
const storage = require('../storage');

const FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

async function callOpenRouter(model, prompt, apiKey, systemInstruction) {
    console.log(`[OpenRouter] Thinking with ${model}...`);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Antigravity", // Optional
            "X-Title": "Discord Transcribe Bot", // Optional
        },
        body: JSON.stringify({
            "model": model,
            "messages": [
                { "role": "system", "content": systemInstruction },
                { "role": "user", "content": prompt }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content;
}

async function generateResponse(prompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return "I'm missing my OpenRouter API key.";
    }

    // Load Personality
    let systemInstruction = "You are a helpful assistant.";
    try {
        const configPath = path.join(__dirname, '../ai_config.txt');
        if (fs.existsSync(configPath)) {
            systemInstruction = fs.readFileSync(configPath, 'utf8');
        }
    } catch (e) { }

    const selectedModel = storage.getAiModel() || process.env.OPENROUTER_MODEL || FALLBACK_MODEL;

    try {
        const text = await callOpenRouter(selectedModel, prompt, apiKey, systemInstruction);
        if (text) return text;
    } catch (error) {
        console.error(`[OpenRouter] Error with ${selectedModel}: ${error.message}`);

        // If the selected model wasn't the fallback, try the fallback
        if (selectedModel !== FALLBACK_MODEL) {
            try {
                console.log(`[OpenRouter] Retrying with fallback: ${FALLBACK_MODEL}`);
                const text = await callOpenRouter(FALLBACK_MODEL, prompt, apiKey, systemInstruction);
                if (text) return text;
            } catch (fallbackError) {
                console.error(`[OpenRouter] Fallback failed: ${fallbackError.message}`);
            }
        }
    }

    return "I'm having trouble thinking right now. The networks are busy.";
}

module.exports = { generateResponse };
