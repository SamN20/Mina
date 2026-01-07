const mood = require('../mood');
const storage = require('../../core/storage');
const ai = require('../../integrations/ai');
const audio = require('../../integrations/discord/audio');
const satellite = require('../../integrations/satellite');
const vrmAnimation = require('../../core/vrm/animation');
const fs = require('fs');
const path = require('path');
const memory = require('../../core/memory');
const history = require('../../core/history');
const { ActionType } = require('../../core/types');
const soundboard = require('../soundboard/utils');

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

    // Check Global Settings
    if (type === 'text' && !storage.getAutoTextEnabled()) return;
    if (type === 'voice' && !storage.getAutoVoiceEnabled()) return;

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
        text,
        username,
        userId: context.userId, // ADDED: track userId
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

    // Enrich Transcript (Resolve Users)
    const transcript = await Promise.all(validBuffer.map(async (i) => {
        let name = i.username;
        let extraInfo = "";

        if (i.userId) {
            const profile = memory.getProfileData(i.userId);
            if (profile.displayName) name = profile.displayName;
        }
        return `${name}: ${i.text}`;
    }));

    // Inject Main Persona
    let systemInstruction = "You are a helpful assistant.";
    try {
        const configPath = path.join(__dirname, '../../../ai_config.txt');
        if (fs.existsSync(configPath)) {
            systemInstruction = fs.readFileSync(configPath, 'utf8');
        }
        // Inject Mood
        const currentMood = mood.getMood();
        systemInstruction += `\n[CURRENT MOOD] Tilt: ${currentMood.level}%\n`;
    } catch (e) { }

    // Inject Contexts
    const nowP = new Date();
    const shortTime = nowP.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Recent Direct History (Last 3)
    let directContext = "";
    if (context.userId) {
        const h = history.get(context.userId).slice(-3);
        if (h.length > 0) {
            directContext = h.map(m => `[${m.role === 'user' ? 'User' : 'You'}]: ${m.content}`).join('\n');
        }
    }

    const prompt = `
${systemInstruction}

[Context]
Current Time: ${shortTime}
${directContext ? `\n[Recent Direct Interaction with Speaker]\n(You just said this to them directly. Be consistent.)\n${directContext}\n` : ''}

[Bystander Conversation]
(You are listening to this conversation nearby)
${transcript.join('\n')}

[Instructions]
- Observe the Bystander Conversation above.
- Decide if you want to chime in with a short, witty, amusing, or helpful comment.
- You should ONLY speak if the conversation is interesting or if you have something valuable/funny to add.
- Do NOT interrupt if they are just coordinating game tactics or saying short phrases.
- If you want to speak, output your response directly. 
- If you want to stay silent, output "SILENT".
- Keep response under 2 sentences.
- You can perform animations by including [anim:Name] in your response.
- Available animations: ${vrmAnimation.getAvailableAnimations()}.
${soundboard.getPromptSupplement()}
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

        // Parse Animations (Multi-Support)
        const animRegex = /\[anim:\s*(.*?)\]/gi;
        const animMatches = [...spokenResponse.matchAll(animRegex)];

        if (animMatches.length > 0) {
            animMatches.forEach((m, index) => {
                const animName = m[1].trim();
                console.log(`[AutoConvo] Triggering animation: ${animName}`);
                setTimeout(() => {
                    if (satellite && satellite.playGesture) {
                        satellite.playGesture(null, animName);
                    } else if (satellite && satellite.broadcast) {
                        satellite.broadcast('gesture', { type: animName, duration: 4.0 });
                    }
                }, index * 2500);
            });
            spokenResponse = spokenResponse.replace(animRegex, '').trim();
        }

        // Parse Soundboard mixed with text
        // (We strip [sound:xxx] from text for 'spokenResponse', but for 'voice', we play sequence)

        let sequence = [];

        if (type === 'text') {
            // For text, we just strip the sound tags but maybe mention them?
            // Or just strip them.
            spokenResponse = spokenResponse.replace(/\[sound:\s*(.*?)\]/gi, '').trim();
        } else {
            // For voice, calculate sequence
            sequence = soundboard.parseMixedAudio(spokenResponse);
            // spokenResponse for text channel fallback (stripped)
            spokenResponse = spokenResponse.replace(/\[sound:\s*(.*?)\]/gi, '').trim();
        }

        // Check for Rage Quit (AutoConvo)
        if (mood.getMood().level >= 100 && type !== 'text') {
            console.log('[AutoConvo] Tilt reached 100%. Triggering Rage Quit.');
            // Just speak the stripped text then leave
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
            // Voice Buffer (Sequence Execution)
            if (sequence.length > 0) {
                for (const item of sequence) {
                    if (item.type === 'speak') {
                        await audio.speak(guildId, item.content);
                    } else if (item.type === 'sound') {
                        const soundPath = soundboard.getSoundPath(item.content);
                        if (soundPath) {
                            console.log(`[AutoConvo] Playing sound: ${item.content}`);
                            await audio.playFile(guildId, soundPath, 0, 0.6, true);
                        }
                    }
                }
            } else {
                await audio.speak(guildId, spokenResponse);
            }
        }

        lastChimeTimes.set(key, now);

    } catch (e) {
        console.error("[AutoConvo] Error:", e);
    }
}

module.exports = { processUtterance };
