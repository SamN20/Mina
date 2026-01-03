const mood = require('../mood');
const storage = require('../../core/storage');
const ai = require('../../integrations/ai');
const audio = require('../../integrations/discord/audio');
const { ActionType } = require('../../core/types');

// Configuration
const BUFFER_SIZE = 15; // Keep last 15 lines
const BUFFER_TIME_WINDOW = 5 * 60 * 1000; // 5 minutes
const CHIME_COOLDOWN = 15 * 60 * 1000; // 15 minutes between chimes
const MIN_LINES_TO_TRIGGER = 4; // Need at least 4 lines in window
const TRIGGER_CHANCE = 0.3; // 30% chance to check AI if conditions met

// State
const conversationBuffers = new Map(); // key (guildId or channelId) -> Array of { text, username, time }
const lastChimeTimes = new Map(); // key -> timestamp

/**
 * Process a new utterance for potential chime-in
 * @param {string} text 
 * @param {Object} context 
 */
async function processUtterance(text, context) {
    const { guildId, username, channelId, type, channel } = context;
    
    // Use channelId as key for text channels, guildId for voice (to span across re-joins)
    // Actually, let's use channelId for everything to be specific.
    // If voiceHandler doesn't pass channelId, fallback to guildId.
    const key = channelId || guildId;

    // 1. Add to Buffer
    if (!conversationBuffers.has(key)) {
        conversationBuffers.set(key, []);
    }
    const buffer = conversationBuffers.get(key);
    
    buffer.push({
        text,
        username,
        time: Date.now()
    });

    // 2. Clean Buffer (Time & Size)
    const now = Date.now();
    const validBuffer = buffer.filter(item => now - item.time < BUFFER_TIME_WINDOW);
    
    // Trim to max size
    if (validBuffer.length > BUFFER_SIZE) {
        validBuffer.splice(0, validBuffer.length - BUFFER_SIZE);
    }
    
    conversationBuffers.set(key, validBuffer);

    // 3. Check Conditions
    const debug = storage.getDebugMode();
    
    if (!debug) {
        // - Cooldown passed?
        const lastChime = lastChimeTimes.get(key) || 0;
        if (now - lastChime < CHIME_COOLDOWN) return;

        // - Enough activity?
        if (validBuffer.length < MIN_LINES_TO_TRIGGER) return;

        // - Random Chance (to avoid checking every single line)
        if (Math.random() > TRIGGER_CHANCE) return;
    } else {
        console.log(`[AutoConvo] Debug Mode: Bypassing checks for ${key}`);
    }

    // 4. Ask AI
    console.log(`[AutoConvo] Checking if Mina should chime in for ${key}...`);
    
    const transcript = validBuffer.map(i => `${i.username}: ${i.text}`).join('\n');
    
    const prompt = `
You are hanging out in a ${type === 'text' ? 'text chat' : 'voice chat'} with friends.
Here is the recent conversation:
${transcript}

[Instructions]
- Decide if you want to chime in with a short, witty, or helpful comment.
- You should ONLY speak if the conversation is interesting or if you have something valuable to add.
- Do NOT interrupt if they are just coordinating game tactics or saying short phrases.
- If you want to speak, output your response directly.
- If you want to stay silent, output "SILENT".
- Keep response under 2 sentences.
${debug ? '- DEBUG MODE ACTIVE: You MUST respond with something. Do not be silent.' : ''}
`;

    try {
        const response = await ai.generateResponse(prompt);
        
        if (!response || response.includes('SILENT') || response.length < 2) {
            console.log(`[AutoConvo] AI decided to stay silent.`);
            return;
        }

        // 5. Respond
        console.log(`[AutoConvo] Chiming in: "${response}"`);
        
        let spokenResponse = response;

        // Parse Status
        const statusRegex = /\[status:\s*"?(.*?)"?\]/i;
        const statusMatch = spokenResponse.match(statusRegex);
        if (statusMatch) {
            // We can't easily set status from here without client ref, but we can strip the tag
            spokenResponse = spokenResponse.replace(statusRegex, '').trim();
        }

        // Parse Tilt (Mood)
        const tiltRegex = /\[tilt:\s*([+-]?\d+)\]/i;
        const tiltMatch = spokenResponse.match(tiltRegex);
        if (tiltMatch) {
            const delta = parseInt(tiltMatch[1], 10);
            if (!isNaN(delta)) {
                mood.modifyTilt(delta);
            }
            spokenResponse = spokenResponse.replace(tiltRegex, '').trim();
        }

        // Check for Rage Quit (AutoConvo)
        if (mood.getMood().level >= 100 && type !== 'text') {
             console.log('[AutoConvo] Tilt reached 100%. Triggering Rage Quit.');
             audio.speak(guildId, spokenResponse);
             setTimeout(() => {
                 audio.leave(guildId);
             }, 4000); // Wait for TTS to finish (approx)
             return;
        }

        if (type === 'text' && channel) {
            // Simulate typing
            await channel.sendTyping();
            // Small delay for realism
            setTimeout(() => {
                channel.send(spokenResponse);
            }, 2000);
        } else {
            audio.speak(guildId, spokenResponse);
        }
        
        lastChimeTimes.set(key, now);

    } catch (e) {
        console.error("[AutoConvo] Error:", e);
    }
}

module.exports = { processUtterance };
