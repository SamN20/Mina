const fs = require('fs');
const path = require('path');
const storage = require('../../core/storage');
const mood = require('../../features/mood');
const vrmAnimation = require('../../core/vrm/animation');

const FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

// Helper function removed, now inline in generateResponse to support full history


async function generateResponse(prompt, history = []) {
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
        systemInstruction += `To send a DM to someone, use the tag [dm:Name:Message]. For example: [dm:Sam:Something is wrong!]. You can do this if you need to tell them something private or urgent. If you need help contact Sam.\n`;
        systemInstruction += `You can perform animations by including [anim:Name] in your response. Available animations: ${vrmAnimation.getAvailableAnimations()}.\n`;

        // Inject Time
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        systemInstruction += `\n[TIME CONTEXT]\nCurrent Time: ${dateString} at ${timeString}\n`;
        systemInstruction += `\n[NOTE]\nThe chat history usually includes timestamps [MM/DD HH:MM] for your reference. DO NOT include these timestamps or your name in your actual response. Just speak naturally.\n`;


        if (currentMood.level >= 95) {
            systemInstruction += "You are at MAX TILT. You are furious. Yell at them, tell them you are leaving, and then STOP TALKING.\n";
        } else if (currentMood.level > 80) {
            systemInstruction += "You are currently VERY ANGRY. Respond aggressively and complain about lag or teammates.\n";
        } else if (currentMood.level > 50) {
            systemInstruction += "You are annoyed. Be sarcastic and short.\n";
        }
    } catch (e) { }

    const selectedModel = storage.getAiModel() || process.env.OPENROUTER_MODEL || FALLBACK_MODEL;

    // Construct Messages
    const messages = [
        { "role": "system", "content": systemInstruction }
    ];

    // Add History
    // We format history slightly to ensure time awareness without breaking role structure
    // Since roles are strict (user/assistant), we prepend time to content
    for (const msg of history) {
        let prefix = "";
        if (msg.timestamp) {
            // Use relative time for older messages? Or just short absolute.
            // Let's use short absolute: [MM/DD HH:MM]
            const d = new Date(msg.timestamp);
            const ts = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            prefix = `[${ts}] `;
        }
        messages.push({
            "role": msg.role,
            "content": `${prefix}${msg.name ? `(${msg.name}): ` : ''}${msg.content}`
        });
    }

    // Add current prompt
    // Explicitly add time so it is the last thing the AI sees
    const nowP = new Date();
    const shortTime = nowP.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messages.push({ "role": "user", "content": `[Current Time: ${shortTime}] ${prompt}` });


    try {
        // Updated call signature to accept messages directly? 
        // No, `callOpenRouter` currently takes (model, prompt, apiKey, systemInstruction).
        // WE NEED TO REFACTOR `callOpenRouter` OR bypassing it.
        // Let's refactor `callOpenRouter` to accept an array of messages instead.

        console.log(`[OpenRouter] Thinking with ${selectedModel}... (History: ${history.length} items)`);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/Antigravity",
                "X-Title": "Discord Transcribe Bot",
            },
            body: JSON.stringify({
                "model": selectedModel,
                "messages": messages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const video = await response.json();
        let text = video.choices[0]?.message?.content;

        if (text) {
            // Cleanup: Strip potential timestamp hallucinations (e.g. "[1/6 10:00] (Mina): text")
            // Regex: Start with [], optional parens, colon, space
            text = text.replace(/^\[\d{1,2}\/\d{1,2}\s\d{1,2}:\d{2}\]\s*(\(.*?\))?:?\s*/, '').trim();
            // Also generic cleanup in case format varies slightly
            text = text.replace(/^\[.*?\]\s*\(.*?\):\s*/, '').trim();

            return text;
        }

    } catch (error) {
        console.error(`[OpenRouter] Error with ${selectedModel}: ${error.message}`);
        // Fallback logic could be complex here because we changed the interface.
        // For now, let's keep the fallback simple but it will lack history if we don't duplicate logic.
        // We will just try one fallback call with the OLD method (just prompt) or adapt it.
        // Let's just return error message for now to be safe or try fallback with just prompt.

        if (selectedModel !== FALLBACK_MODEL) {
            console.log(`[OpenRouter] Retrying with fallback: ${FALLBACK_MODEL}`);
            try {
                // RE-USE the same messages payload but swap model
                const fallbackResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://github.com/Antigravity",
                        "X-Title": "Discord Transcribe Bot",
                    },
                    body: JSON.stringify({
                        "model": FALLBACK_MODEL,
                        "messages": messages
                    })
                });
                if (fallbackResponse.ok) {
                    const data = await fallbackResponse.json();
                    return data.choices[0]?.message?.content;
                }
            } catch (e2) { console.error("Fallback failed", e2); }
        }
    }

    return "I'm having trouble thinking right now. The networks are busy.";
}

module.exports = { generateResponse };
