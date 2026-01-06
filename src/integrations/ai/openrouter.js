const fs = require('fs');
const path = require('path');
const storage = require('../../core/storage');
const mood = require('../../features/mood');
const vrmAnimation = require('../../core/vrm/animation');

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
        const configPath = path.join(__dirname, '../../../ai_config.txt');
        if (fs.existsSync(configPath)) {
            systemInstruction = fs.readFileSync(configPath, 'utf8');
        }
        
        // Inject Mood
        const currentMood = mood.getMood();
        systemInstruction += `\n\n[CURRENT STATE]\nTilt Level: ${currentMood.level}%\nMood Description: ${currentMood.description}\n`;
        systemInstruction += `\n[INSTRUCTIONS]\nAnalyze the user's message. If they are rude, annoying, or mention things you hate (like Call of Duty), INCREASE your tilt level. If they are nice, funny, or talk about tech/coding, DECREASE it.\n`;
        systemInstruction += `To change your tilt, include a tag like [tilt: +10] or [tilt: -5] in your response. This tag will be hidden from the user.\n`;
        systemInstruction += `You can perform animations by including [anim:Name] in your response. Available animations: ${vrmAnimation.getAvailableAnimations()}.\n`;
        
        if (currentMood.level >= 95) {
            systemInstruction += "You are at MAX TILT. You are furious. Yell at them, tell them you are leaving, and then STOP TALKING.\n";
        } else if (currentMood.level > 80) {
            systemInstruction += "You are currently VERY ANGRY. Respond aggressively and complain about lag or teammates.\n";
        } else if (currentMood.level > 50) {
            systemInstruction += "You are annoyed. Be sarcastic and short.\n";
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
