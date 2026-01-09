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
const usage = require('./usage');

// Configuration
const BUFFER_SIZE = 15; // Keep last 15 lines
const BUFFER_TIME_WINDOW = 5 * 60 * 1000; // 5 minutes
const CHIME_COOLDOWN = 15 * 60 * 1000; // 15 minutes between chimes
const HOT_THREAD_COOLDOWN = 0; // 0 minutes if in hot thread
const HOT_THREAD_WINDOW = 2 * 60 * 1000; // 2 minutes to keep thread hot
let MIN_LINES_TO_TRIGGER = 4; // Need at least 4 lines in window
const TRIGGER_CHANCE = 0.3; // 30% chance to check AI if conditions met

// State
const conversationBuffers = new Map(); // key (guildId or channelId) -> Array of { text, username, time }
const lastChimeTimes = new Map(); // key -> timestamp (last time she spoke)
const hotThreads = new Map(); // key -> timestamp (expires after HOT_THREAD_WINDOW)

/**
 * Process a new utterance for potential chime-in
 * @param {string} text 
 * @param {Object} context 
 */
async function processUtterance(text, context) {
    const { guildId, username, channelId, type, channel, isDirect, replyContext } = context;

    // Check Global Settings
    if (type === 'text' && !storage.getAutoTextEnabled()) return;
    if (type === 'voice' && !storage.getAutoVoiceEnabled()) return;

    // Use channelId as key for text channels, guildId for voice (to span across re-joins)
    const key = channelId || guildId;

    // 1. Add to Buffer
    if (!conversationBuffers.has(key)) {
        conversationBuffers.set(key, []);
    }
    const buffer = conversationBuffers.get(key);

    buffer.push({
        text,
        username,
        userId: context.userId,
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

    // 3. Logic Gating
    const debug = storage.getDebugMode();
    let shouldCheckAI = false;
    let boostedChance = false;

    // Determine Cooldown
    const lastChime = lastChimeTimes.get(key) || 0;
    const hotUntil = hotThreads.get(key) || 0;

    // Voice Logic: Disable "Hot Thread" mode to prevent constant replies in voice (too intrusive)
    const isHot = (type !== 'voice') && (now < hotUntil);
    const applicableCooldown = isHot ? HOT_THREAD_COOLDOWN : CHIME_COOLDOWN;


    // FEATURE: Topic Sniping / Smart Wake-up
    // If text contains keywords, boost chance to 100% and ignore line minimum
    // Removed general pronouns 'she'/'her' to reduce false positives
    const keywords = ['mina', 'bot', ' ai ']; // Added spaces to ' ai ' to match word only, though includes check is partial. 
    // Actually .includes('ai') matches 'said'. We should use regex or word boundary.
    // For simplicity, let's just stick to the specific names.
    const lowerText = text.toLowerCase();

    // Better keyword matching (whole word for short ones)
    const isTargeted = ['mina', 'minabot'].some(k => lowerText.includes(k)) ||
        /\b(bot|ai|she|her)\b/i.test(text) && false; // Disabling broad pronouns for now as requested.

    // Let's stick to the user's implicit request: "she", "her" caused issues.
    // Safe list:
    const safeKeywords = ['mina', 'humanoid', 'robot', 'assistant'];
    const safeTargeted = safeKeywords.some(k => lowerText.includes(k)) || /\b(bot|ai)\b/i.test(text);

    if (isDirect) {
        // FEATURE: Direct Mention Priority
        // Always reply to mentions, ignoring cooldowns
        shouldCheckAI = true;
        console.log(`[AutoConvo] Direct mention detected in ${key}. Bypassing checks.`);
    } else if (debug) {
        shouldCheckAI = true;
        console.log(`[AutoConvo] Debug Mode: Bypassing checks for ${key}`);
    } else {
        // Normal Passive Logic

        // Check cooldown
        if (now - lastChime < applicableCooldown && !safeTargeted) {
            // Too soon
            return;
        }

        // FILTER: Very short messages in Hot/Normal mode (unless targeted/direct)
        // Ignored: "lol", "lmao", "ok", "skull emoji"
        if (!safeTargeted && !isDirect && text.length < 5) return;

        // Check activity level
        // If targeted, ignore min lines. If hot, ignore min lines (keep flow).
        // Otherwise, need MIN_LINES
        if (!safeTargeted && !isHot && validBuffer.length < MIN_LINES_TO_TRIGGER) return;

        // Check Probability
        // Targeted = 100%
        // Hot = 60% (Lowered from 80% to reduce spam)
        // Normal = 30%
        let chance = TRIGGER_CHANCE;
        if (safeTargeted) chance = 1.0;
        else if (isHot) chance = 0.6;

        if (Math.random() <= chance) {
            shouldCheckAI = true;
        }
    }

    if (!shouldCheckAI) return;

    // 4. Rate Limit Check (Text Only)
    // Voice usually has different considerations or is 'unlimited' relative to this feature's strict controls
    if (type === 'text') {
        if (!usage.checkLimit()) {
            console.log(`[AutoConvo] Daily text limit reached (${usage.DAILY_LIMIT}). Skipping.`);
            return;
        }
        // Send Typing Indicator immediately
        if (channel) channel.sendTyping();
    }

    // 5. Ask AI
    console.log(`[AutoConvo] Asking AI for ${key} (Direct: ${isDirect}, Hot: ${isHot}, Targeted: ${safeTargeted})...`);
    if (type === 'text') usage.incrementUsage();

    // Enrich Transcript (Resolve Users)
    const transcript = await Promise.all(validBuffer.map(async (i) => {
        let name = i.username;
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
    const channelName = channel ? channel.name : 'unknown-channel';

    // MEMORY & CONTEXT INTEGRATION (Unified with Voice Pipeline)
    let memoryContext = "";
    try {
        // Use the robust getContext from memory core which handles profile, gaming, search, and recall
        // We use the *last* speaker's ID for the context lookup if possible
        if (context.userId) {
            memoryContext = await memory.getContext(context.userId, username, text);
        } else {
            // Fallback if no specific target (e.g. ambient noise?), just get AI context?
            // Or maybe getContext handles missing user? It expects userId.
            // We'll just search generic if we have to.
            const aiProfile = memory.getProfileData("MINA_SELF");
            if (aiProfile.memories.length > 0) {
                const genericSearch = await memory.searchMemories(text, 3);
                if (genericSearch.length) memoryContext = `\n[Relevant Memories]\n${genericSearch.map(r => "- " + r.text).join('\n')}\n`;
            }
        }
    } catch (e) { console.error("[AutoConvo] Memory Context Error:", e); }

    const prompt = `
${systemInstruction}

[Context]
Current Time: ${shortTime}
Channel: #${channelName}
${isDirect ? '[ALERT] You were directly mentioned or replied to. You MUST respond.' : '(You are observing this conversation)'}
${replyContext ? `\n[Replying To]\n(The user is explicitly replying to this message)\n${replyContext.username}: ${replyContext.content}\n` : ''}
${memoryContext}

[Conversation Log]
${transcript.join('\n')}

[Instructions]
- Decide if you want to speak.
- If this is a Direct Mention, you MUST respond.
- If this is passive observation:
    - Respond if you have something witty, helpful, or funny to add.
    - Output "SILENT" if you have nothing to say.
- Output "REACT:emoji" (e.g., REACT:🔥) if a text response is too much but you want to acknowledge the message.
- Keep text responses short (max 2 sentences).
- You can perform animations: [anim:Name]
- Available animations: ${vrmAnimation.getAvailableAnimations()}.
${soundboard.getPromptSupplement()}
`;

    try {
        // Record User Input to History (if direct)
        // If it's a "bystander" conversation, we might not want to clog "Direct History" with it?
        // But if she responds, it becomes part of the shared history.
        // Let's only add to history if she decides to speak OR if it was a Direct Mention.
        if (isDirect && context.userId) {
            history.add(context.userId, 'user', text, username);
        }

        const response = await ai.generateResponse(prompt);

        if (!response || (response.includes('SILENT') && !isDirect) || response.length < 2) {
            console.log(`[AutoConvo] AI decided to stay silent.`);
            return;
        }

        // 6. Processing Response
        console.log(`[AutoConvo] Response: "${response}"`);

        // MEMORY & HISTORY UPDATE
        if (context.userId) {
            // Learn from this interaction (now that she has replied)
            // We fetch the latest history *including* what she just said (added below)
            // Actually, we need to add HER response to history first? 
            // processUtterance is async. 
            // In pipeline: history.add(user) -> generate -> learn -> history.add(ai)

            // Note: If we didn't add the user msg above (was passive), should we add it now?
            // If she speaks, the context is established. Ideally yes.
            // But if it was a group chat log... `text` is just the LAST message.
            // The prompt contained the TRANSCRIPT.
            // Learning should probably focus on the *Interaction*.
            // Let's simple-track: Add her response to history.

            // Clean response for storage (strip tags)
            // UPDATE: We want to save RAW response to history so she remembers actions (like [dm])
            // const cleanResponse = response.replace(/\[.*?\]/g, '').trim(); 
            // We still calculate cleanResponse for learning? 
            // Actually, learnFromInteraction takes (userId, userText, aiText, history, thoughts).
            // We can derive cleanText from the parser result.

            const parser = require('../../core/ai/parser');
            // We parse later in the function, but need it here for learning/clean text?
            // Let's parse early.

            // Note: We duplicate parse logic if we do it here and below?
            // Let's just use the 'response' for history.

            // If we haven't added the user message yet (passive wake-up), add it now effectively as context
            if (!isDirect) {
                history.add(context.userId, 'user', text, username);
            }

            // Learn (We need parsed thoughts and clean text)
            // We will parse properly in the Standard Processing block, but we need to Learn NOW?
            // Or can we move Learning to after parsing?
            // The code structure executes "Standard Processing" at line 298.
            // Let's defer learning/history update until we have parsed?
            // But we need to update history BEFORE generating the NEXT response if we were in a loop (not applicable here).
            // Actually, let's just do a quick parse or move the logic.
            // Moving the logic is safer to avoid double parsing.

            // Let's just save RAW response here.
            history.add(context.userId, 'assistant', response, 'Mina');

            // For learning, we need clean text.
            const tempParsed = parser.parseResponse(response);
            memory.learnFromInteraction(
                context.userId,
                text,
                tempParsed.spokenText,
                history.get(context.userId),
                tempParsed.thoughts
            );
        }

        // FEATURE: Hot Thread Mode
        // If she speaks, set thread to HOT for X minutes
        lastChimeTimes.set(key, now);
        hotThreads.set(key, now + HOT_THREAD_WINDOW);

        // Handle REACT:
        if (response.startsWith('REACT:')) {
            const emoji = response.replace('REACT:', '').trim();
            // We need the TARGET message to react to.
            // Assumption: React to the *last* message in the buffer (the one that triggered this)
            // We need the message object. 'channel' is passed, but we don't have the message ID in the buffer struct.
            // Since `processUtterance` is called *instantly* on message create, we can assume the last message in channel is the target?
            // Or better: pass the message object in 'context' if available, or just fetch last.
            if (type === 'text' && channel && channel.lastMessageId) {
                try {
                    const msg = await channel.messages.fetch(channel.lastMessageId);
                    if (msg) await msg.react(emoji);
                } catch (e) { console.error("Failed to react:", e); }
            }
            return;
        }

        // Standard Processing (Status, Tilt, Anim, Sound)
        const parser = require('../../core/ai/parser');
        const parsed = parser.parseResponse(response);

        let spokenResponse = parsed.spokenText;

        // Log Thoughts
        if (parsed.thoughts) {
            console.log(`\n\x1b[36m[AutoConvo Thoughts]\x1b[0m\n${parsed.thoughts}\n`);
        }

        // Apply Mood Tilt
        if (parsed.actions.tilt !== null) {
            mood.modifyTilt(parsed.actions.tilt);
        }

        // Handle Animations
        if (parsed.actions.anims.length > 0) {
            parsed.actions.anims.forEach((animName, index) => {
                setTimeout(() => {
                    if (satellite && satellite.playGesture) satellite.playGesture(null, animName);
                    else if (satellite && satellite.broadcast) satellite.broadcast('gesture', { type: animName, duration: 4.0 });
                }, index * 2500);
            });
        }

        // Handle DM (New Feature for AutoConvo)
        if (parsed.actions.dm) {
            const { targetName, messageContent } = parsed.actions.dm;
            console.log(`[AutoConvo] AI wants to DM "${targetName}": "${messageContent}"`);
            const targetUser = memory.findUserByName(targetName);
            if (targetUser) {
                // We need to actually SEND the DM here because AutoConvo doesn't return an ActionPlan like handleUtterance
                // It executes directly.
                const discordClient = require('../../integrations/discord/client');
                // Assuming we can get client or use a utility. 
                // Actually, handleUtterance returns an ActionPlan. AutoConvo executes.
                // We need a way to send DM. 
                // Let's check if we have a DM utility. The pipeline usually lets the 'voice/message' handler do it.
                // Here we are "Acting".
                try {
                    // We need to fetch the user from Discord client to send DM
                    const user = await discordClient.client.users.fetch(targetUser.id);
                    if (user) await user.send(messageContent);
                } catch (e) { console.error("[AutoConvo] Failed to send DM:", e); }
            } else {
                console.warn(`[AutoConvo] Could not find user "${targetName}" for DM.`);
            }
        }

        // Parse Soundboard
        let sequence = [];
        if (type === 'text') {
            spokenResponse = spokenResponse.replace(/\[sound:\s*(.*?)\]/gi, '').replace(/\[\/sound\]/gi, '').trim();
        } else {
            sequence = soundboard.parseMixedAudio(spokenResponse);
            spokenResponse = spokenResponse.replace(/\[sound:\s*(.*?)\]/gi, '').replace(/\[\/sound\]/gi, '').trim();
        }

        // Execution
        if (type === 'text' && channel) {
            await channel.sendTyping();
            setTimeout(() => {
                channel.send(spokenResponse);
            }, 2000);
        } else {
            if (sequence.length > 0) {
                for (const item of sequence) {
                    if (item.type === 'speak') await audio.speak(guildId, item.content);
                    else if (item.type === 'sound') {
                        const soundPath = soundboard.getSoundPath(item.content);
                        if (soundPath) await audio.playFile(guildId, soundPath, 0, 0.6, true);
                    }
                }
            } else {
                await audio.speak(guildId, spokenResponse);
            }
        }

    } catch (e) {
        console.error("[AutoConvo] Error:", e);
    }
}

/**
 * Inject a bot message into the buffer (for external features like Gaming)
 * @param {string} guildId 
 * @param {string} text 
 */
function injectBotMessage(guildId, text) {
    // Determine key (Voice uses guildId)
    // If text channel context is needed, we might need channelId, but mainly this is for Voice features
    const key = guildId;

    if (!conversationBuffers.has(key)) {
        conversationBuffers.set(key, []);
    }
    const buffer = conversationBuffers.get(key);

    const now = Date.now();
    buffer.push({
        text,
        username: 'Mina',
        userId: 'MINA_SELF',
        time: now
    });

    // Clean Buffer
    const validBuffer = buffer.filter(item => now - item.time < BUFFER_TIME_WINDOW);
    if (validBuffer.length > BUFFER_SIZE) {
        validBuffer.splice(0, validBuffer.length - BUFFER_SIZE);
    }
    conversationBuffers.set(key, validBuffer);
}

module.exports = { processUtterance, injectBotMessage };
