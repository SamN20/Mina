const fs = require('fs');
const path = require('path');
const storage = require('../../core/storage');
const mood = require('../../features/mood');
const vrmAnimation = require('../../core/vrm/animation');
const toolRegistry = require('../../core/ai/toolRegistry');

// Initialize tools
toolRegistry.loadTools();

const FALLBACK_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

// Helper function removed, now inline in generateResponse to support full history


async function generateResponse(prompt, history = [], options = {}) {
    // Default options
    const { forceThoughts = true, depth = 0 } = options;

    // Safety: Prevent infinite loops
    if (depth > 5) {
        console.warn("[OpenRouter] Max recursion depth reached.");
        return "I'm executing too many actions at once. Let me stop here.";
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return "I'm missing my OpenRouter API key.";
    }

    // --- 1. IDENTITY & PERSONALITY ---
    let identityInstruction = "You are a helpful assistant.";

    // Define selectedModel early
    const selectedModel = storage.getAiModel() || process.env.OPENROUTER_MODEL || FALLBACK_MODEL;

    // OVERRIDE: If a custom system instruction is provided (e.g. for Memory), use it and skip persona loading.
    if (options.systemInstruction) {
        identityInstruction = options.systemInstruction;
    } else {
        try {
            const configPath = path.join(__dirname, '../../../ai_config.txt');
            if (fs.existsSync(configPath)) {
                identityInstruction = fs.readFileSync(configPath, 'utf8');
            }
        } catch (e) { }
    }

    // If we are using a custom instruction (like Memory), we can likely skip the rest of the complex prompt construction
    // But let's keep the structure consistent in case we want to inject time/etc into memory too.
    // actually, for memory (options.systemInstruction), we usually want JUST that.
    if (options.systemInstruction) {
        return await callOpenRouter(selectedModel, [{ "role": "system", "content": identityInstruction }, { "role": "user", "content": prompt }], apiKey);
    }
    // (Note: callOpenRouter refactor needed below or we handle it here)
    // Let's standardise the flow.


    // --- 2. DYNAMIC STATE (Mood, Time, Context) ---
    const now = new Date();
    const timeOptions = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' };
    const dateOptions = { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    const timeString = now.toLocaleTimeString('en-US', timeOptions);
    const dateString = now.toLocaleDateString('en-US', dateOptions);

    const currentMood = mood.getMood();

    let stateContext = `\n\n[CURRENT STATE]
Time: ${dateString} at ${timeString}
Mood: ${currentMood.description} (Tilt: ${currentMood.level}%)
`;

    if (currentMood.level >= 95) {
        stateContext += "WARNING: MAX TILT. You are furious. Yell, threaten to leave, then STOP TALKING.\n";
    } else if (currentMood.level > 80) {
        stateContext += "WARNING: VERY ANGRY. Aggressive, complaining about lag/teammates.\n";
    } else if (currentMood.level > 50) {
        stateContext += "WARNING: ANNOYED. Sarcastic and short.\n";
    }

    // --- 3. OPERATIONAL RULES ---
    // Load Tags Config
    let tagsConfig = { tags: [], emotions: [] };
    try {
        const tagsPath = path.join(__dirname, '../../../tags.json');
        if (fs.existsSync(tagsPath)) {
            tagsConfig = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
        }
    } catch (e) {
        console.error("Failed to load tags.json", e);
    }

    // Dynamic Lists
    const soundboard = require('../../features/soundboard/utils');
    const vrmAnimation = require('../../core/vrm/animation');

    const availableSounds = soundboard.getAvailableSounds().join(', ');
    const availableAnims = vrmAnimation.getAvailableAnimations(); // Returns string

    // Build Tag Rules String
    const tagRules = tagsConfig.tags.map(t => {
        let desc = t.description;
        // Inject Dynamic Lists
        if (t.tag.includes('[sound:')) {
            desc += ` Available: ${availableSounds}`;
        }
        if (t.tag.includes('[anim:')) {
            desc = `Triggers a VRM animation. Available: ${availableAnims}`;
        }
        return `   - ${t.tag}: ${desc}`;
    }).join('\n');

    const emotionTags = tagsConfig.emotions.join(', ');

    let rules = `
[OPERATIONAL RULES]
1. **Response Format**: 
   - Start with a SINGLE <thought>...</thought> block to plan.
   - Then provide your spoken response.
   - DO NOT output <msg> tags or timestamps in your response.
   - DO NOT use script format like "[12:00] (Mina): ...". Just speak.
   
2. **Tags & Actions**:
${tagRules}
   - Emotions: ${emotionTags}
   - NO OTHER TAGS allowed (e.g. no [vibration]).

3. **History Protocol**:
   - History is provided in <msg> tags. 
   - PREVIOUS MESSAGES MAY CONTAIN FORMAT ERRORS. DO NOT COPY THEM.
   - Follow THESE rules, not the style of old messages.
`;

    // Combine System Prompt
    let finalSystemPrompt = `${identityInstruction}\n${stateContext}\n${rules}`;

    // --- 4. REMINDERS (Injected at end of System Prompt) ---
    if (forceThoughts) {
        finalSystemPrompt += `\n[SYSTEM REMINDERS]\n- CRITICAL: You MUST start with <thought>.\n- CRITICAL: Use [dm:Name:Msg] to send DMs. Don't just say you will.`;
    }


    // --- 5. HISTORY CONSTRUCTION (XML Style) ---
    const messages = [
        { "role": "system", "content": finalSystemPrompt }
    ];

    // Add History
    for (const msg of history) {
        // XML Format: <msg time="..." name="...">Content</msg>
        // Use relative time or short time? Short absolute is fine with Date context.
        let timeAttr = "";
        if (msg.timestamp) {
            const d = new Date(msg.timestamp);
            // Compact time: MM/DD HH:MM
            // Let's us the explicit format:

            const month = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric' });
            const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', day: 'numeric' });
            // Use h23 to ensure 00-23 format (avoiding 24:00)
            const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' });
            const ts = `${month}/${day} ${time}`;

            timeAttr = ` time="${ts}"`;
        }

        const nameAttr = msg.name ? ` name="${msg.name}"` : "";
        const roleAttr = ` role="${msg.role}"`; // Helper for LLM to know who is who if name is missing

        // We wrap the content in <msg> text
        // Note: OpenRouter/LLMs expect "content" to be the string. 
        // We are formatting the content string itself to LOOK like XML.
        const content = `<msg${roleAttr}${nameAttr}${timeAttr}>${msg.content}</msg>`;

        messages.push({
            "role": msg.role, // "user" or "assistant" - API requirement
            "content": content
        });
    }

    // --- 6. USER PROMPT ---
    // The current user message
    messages.push({
        "role": "user",
        // Force 24h format for prompt timestamp too
        "content": `<msg role="user" time="${now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' })} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'America/New_York' })}"> ${prompt} </msg>`
    });


    // --- 7. FALLBACK MODEL LOOP ---
    const modelsToTry = [selectedModel];
    // Avoid duplicate if fallback is same as selected
    if (selectedModel !== FALLBACK_MODEL) modelsToTry.push(FALLBACK_MODEL);
    // Add a cheap reliable backup
    modelsToTry.push("google/gemini-2.0-flash-exp:free");

    for (const model of modelsToTry) {
        try {
            const requestBody = {
                "model": model,
                "messages": messages
            };

            // Inject Tools if available
            const tools = toolRegistry.getToolSchemas();
            if (tools.length > 0) {
                requestBody.tools = tools;
                requestBody.tool_choice = "auto";
            }

            // 1st Request
            console.log(`[OpenRouter] Thinking with ${model}... (History: ${history.length} items)`);
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/SamN20/Mina",
                    "X-Title": "Mina",
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            const video = await response.json();
            let text = video.choices[0]?.message?.content;
            const message = video.choices[0]?.message;

            // Handle Tool Calls
            if (message && message.tool_calls) {
                console.log(`[OpenRouter] Tool calls detected: ${message.tool_calls.length}`);

                // Add the assistant's request to history so it knows it asked
                messages.push(message);

                // Execute all tools in parallel
                const toolResults = await Promise.all(message.tool_calls.map(async (call) => {
                    try {
                        let args = {};
                        try {
                            args = JSON.parse(call.function.arguments);
                        } catch (e) {
                            console.error("[OpenRouter] Failed to parse tool arguments", e);
                        }
                        const result = await toolRegistry.executeTool(call.function.name, args);

                        return {
                            tool_call_id: call.id,
                            role: "tool",
                            name: call.function.name,
                            content: result
                        };
                    } catch (e) {
                        console.error(`[OpenRouter] Failed to execute tool ${call.function.name}:`, e);
                        return {
                            tool_call_id: call.id,
                            role: "tool",
                            name: call.function.name,
                            content: JSON.stringify({ error: "Execution failed" })
                        };
                    }
                }));

                // Add all results to messages
                messages.push(...toolResults);

                console.log(`[OpenRouter] Tools executed. Sending results back to model...`);

                // 2nd Request (with tool results)
                const followUpResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://github.com/SamN20/Mina",
                        "X-Title": "Mina",
                    },
                    body: JSON.stringify({
                        "model": model,
                        "messages": messages,
                        "tools": tools,
                        "tool_choice": "auto"
                    })
                });

                if (!followUpResponse.ok) {
                    const errorText = await followUpResponse.text();
                    console.error("Follow-up request failed:", errorText);
                    // fallback to what we have? or continue?
                } else {
                    const followUpData = await followUpResponse.json();
                    let followUpText = followUpData.choices?.[0]?.message?.content;

                    if (followUpText) {
                        text = followUpText;
                    } else if (followUpData.choices?.[0]?.message?.tool_calls) {
                        // Potential loop. For now, stop.
                        text = "I've done the calculations, but I'm getting a bit carried away. Let's pause.";
                    }
                }
            }

            if (text) {
                // Cleanup: Strip potential XML hallucinations if it leaks
                text = text.replace(/^<msg.*?>/i, '').replace(/<\/msg>$/i, '').trim();

                // Legacy timestamp strip (Backup)
                text = text.replace(/^\[\d{1,2}\/\d{1,2}\s\d{1,2}:\d{2}\]\s*(\(.*?\))?:?\s*/, '').trim();

                return text;
            }

        } catch (error) {
            console.error(`[OpenRouter] Error with ${model}: ${error.message}`);
            // Continue to next model
        }
    }

    // If we reach here, all models failed
    return "I'm having a bit of a brain fart. Give me a sec.";
}

// Helper for pure calls (Memory etc)
async function callOpenRouter(model, messages, apiKey) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/Antigravity",
                "X-Title": "Discord Transcribe Bot",
            },
            body: JSON.stringify({
                "model": model,
                "messages": messages
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("[OpenRouter] API returned error:", data.error);
            return null;
        }

        if (!data.choices || !data.choices.length) {
            console.error("[OpenRouter] No choices returned. Raw response:", JSON.stringify(data));
            return null;
        }

        return data.choices[0]?.message?.content;
    } catch (e) {
        console.error("[OpenRouter] Simple Call Failed:", e);
        return null;
    }
}

module.exports = { generateResponse };
