const {
    joinVoiceChannel,
    enterState,
    VoiceConnectionStatus,
    EndBehaviorType,
    createAudioPlayer,
    createAudioResource,
    StreamType,
    AudioPlayerStatus
} = require('@discordjs/voice');
const prism = require('prism-media');
const transcription = require('./transcription');
const storage = require('./storage');
const tts = require('./tts');
const gemini = require('./ai'); // Use generic provider
const memory = require('./memory');
const intentClassifier = require('./intentClassifier');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ActivityType } = require('discord.js');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function debugLog(...args) {
    if (storage.getDebugMode()) {
        console.log(...args);
    }
}

const connections = new Map(); // GuildId -> Connection
const activeTranscriptions = new Set(); // UserId -> Boolean (prevents duplicate streams)

// TTS Queue Management
const ttsQueues = new Map(); // GuildId -> Array of { text, code, tempFile }
const isSpeaking = new Map(); // GuildId -> Boolean
const activePlayers = new Map(); // GuildId -> AudioPlayer

// Helper for gTTS mapping
function getGttsParams(code) {
    const mapping = {
        'en-US': { lang: 'en', tld: 'com' },
        'en-GB': { lang: 'en', tld: 'co.uk' },
        'en-AU': { lang: 'en', tld: 'com.au' },
        'en-IN': { lang: 'en', tld: 'co.in' },
        'fr-FR': { lang: 'fr', tld: 'fr' },
        'de-DE': { lang: 'de', tld: 'de' },
        'es-ES': { lang: 'es', tld: 'es' },
        'it-IT': { lang: 'it', tld: 'it' },
        'ja-JP': { lang: 'ja', tld: 'co.jp' },
        'ko-KR': { lang: 'ko', tld: 'co.kr' },
        'pt-BR': { lang: 'pt', tld: 'com.br' },
        'ru-RU': { lang: 'ru', tld: 'ru' }
    };
    return mapping[code] || { lang: 'en', tld: 'com' };
}

// Load responses
let chatterResponses = {};
try {
    const responsesPath = path.join(__dirname, 'responses.json');
    if (fs.existsSync(responsesPath)) {
        chatterResponses = JSON.parse(fs.readFileSync(responsesPath, 'utf8'));
    }
} catch (e) {
    console.error("Failed to load chatter responses:", e);
}

// Cooldown map: GuildId -> Timestamp
const chatterCooldowns = new Map();
const COOLDOWN_MS = 10000; // 10 seconds

async function joinChannel(interaction) {
    const channel = interaction.member.voice.channel;
    if (!channel) {
        return interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
    }

    // Defer reply as joining might take a moment
    await interaction.deferReply();

    // Explicitly destroy old connection if exists to prevent duplicates
    if (connections.has(channel.guild.id)) {
        const oldConn = connections.get(channel.guild.id);
        try { oldConn.destroy(); } catch (e) { }
        connections.delete(channel.guild.id); // clear map
    }

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
        daveEncryption: false
    });

    connections.set(channel.guild.id, connection);
    ttsQueues.set(channel.guild.id, []);
    isSpeaking.set(channel.guild.id, false);

    // Use .once to prevent multiple listeners
    connection.once(VoiceConnectionStatus.Ready, () => {
        console.log(`Connected to ${channel.name}`);
        startListening(connection, channel.guild);

        // Auto-Greeting
        const isSilent = interaction.options ? interaction.options.getBoolean('silent') : false;

        (async () => {
            if (isSilent) {
                speak(channel.guild.id, "Voice transcription is now active.");
                return;
            }

            try {
                // Get Members
                const members = channel.members.filter(m => !m.user.bot);
                const presentUsers = [];

                for (const [id, member] of members) {
                    if (!storage.isOptedOut(id)) {
                        const profile = memory.getProfileData(id);
                        presentUsers.push({
                            name: profile.displayName || member.displayName,
                            facts: profile.facts.slice(0, 5) // Only top 5 facts to keep context small
                        });
                    }
                }

                // Build Prompt
                const userContexts = presentUsers.map(u =>
                    `- ${u.name}: ${u.facts.join(', ')}`
                ).join('\n');

                const count = presentUsers.length;
                const instructions = count > 3
                    ? "Greet the group generally. Briefly mention 1-2 key people if relevant."
                    : "Greet everyone individually by name. Be friendly and personalized based on their facts.";

                const prompt = `
You have just joined a voice channel named "${channel.name}".
People present (${count}):
${userContexts}

[Instructions]
- ${instructions}
- Keep it VERY SHORT (under 2 sentences).
- MANDATORY: End with this exact phrase: "By the way, voice transcription is now active."

Generate the spoken greeting:
`;

                const greeting = await gemini.generateResponse(prompt);
                if (greeting) {
                    console.log(`[Join Greeting] "${greeting}"`);
                    speak(channel.guild.id, greeting);
                } else {
                    speak(channel.guild.id, "Hello everyone! Voice transcription is now active.");
                }

            } catch (e) {
                console.error("Greeting failed:", e);
                speak(channel.guild.id, "Hello! Voice transcription is now active.");
            }
        })();
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                enterState(connection, VoiceConnectionStatus.Signalling, 5_000),
                enterState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch (error) {
            console.log('Disconnected properly');
            connections.delete(channel.guild.id);
            ttsQueues.delete(channel.guild.id);
            isSpeaking.delete(channel.guild.id);
            connection.destroy();
        }
    });

    // Create Embed and Button
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎙️ Live Transcription Active')
        .setDescription(`Joined **${channel.name}** and listening to all users.\nTranscripts are being saved locally.`)
        .addFields({ name: 'Status', value: '🟢 Transcribing', inline: true });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('toggle_chatter')
                .setLabel('🦜 Toggle Chatter')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('leave_voice')
                .setLabel('Stop & Leave')
                .setStyle(ButtonStyle.Danger),
        );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

function startListening(connection, guild) {
    const receiver = connection.receiver;

    // Clear any existing listeners to ensure we don't start multiple streams per user
    receiver.speaking.removeAllListeners('start');

    receiver.speaking.on('start', (userId) => {
        if (!userId) return;

        // Check privacy settings
        if (storage.isOptedOut(userId)) return;

        // Prevent multiple simultaneous transcription processes for the same user
        if (activeTranscriptions.has(userId)) return;
        activeTranscriptions.add(userId);

        const opusStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000,
            },
        });

        opusStream.on('error', (error) => {
            activeTranscriptions.delete(userId);
        });

        // Decode to 16kHz for better Vosk compatibility (model expects 16kHz)
        const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });
        decoder.on('error', (error) => { activeTranscriptions.delete(userId); });

        // Pipe Opus -> PCM (16kHz)
        const pcmStream = opusStream.pipe(decoder);
        pcmStream.on('error', (error) => { activeTranscriptions.delete(userId); });

        // Resolve username
        const member = guild.members.cache.get(userId);
        const username = member ? member.displayName : userId;

        transcription.transcribeStream(pcmStream, userId, (uid, text) => {
            // Normalize wake word variations and classify intent
            const processed = intentClassifier.processTranscription(text);
            const normalizedText = processed.normalized;
            
            // Log normalized result if different from original
            if (normalizedText !== text) {
                console.log(`[Normalized] "${text}" -> "${normalizedText}"`);
            }
            
            console.log(`${username}: ${normalizedText}`);
            if (processed.intent) {
                console.log(`[Intent] ${processed.intent} (confidence: ${(processed.confidence * 100).toFixed(0)}%)`);
            }
            
            storage.saveTranscript(username, uid, normalizedText);

            // Only if AI is enabled
            if (storage.getAiEnabled()) {
                // CRITICAL: Only proceed if intent classifier validated the wake word
                // If processed.intent is null, the classifier rejected it (no wake word, too deep, etc.)
                if (!processed.intent) {
                    return; // Intent classifier rejected this, don't check triggers
                }

                const lowerText = normalizedText.toLowerCase();

                // Dynamic AI Trigger
                const triggers = storage.getTriggerWords();
                // Escape special characters in triggers just in case
                const escapedTriggers = triggers.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const pattern = `\\b(${escapedTriggers.join('|')})\\b`;
                const triggerRegex = new RegExp(pattern, 'i');

                const match = normalizedText.match(triggerRegex);

                if (match) {
                    // Use the afterWakeWord from intent classifier if available
                    const query = processed.afterWakeWord || normalizedText.slice(match.index + match[0].length).trim();

                    // Check trigger confidence and query length
                    const triggerConfidence = processed.triggerConfidence || 1.0;
                    const queryWords = query.trim().split(/\s+/).filter(Boolean).length;
                    const musicIntentConfidence = processed.confidence || 0;
                    const isMusicCommand = processed.intent === 'music' && musicIntentConfidence > 0.6;
                    
                    // Allow short queries if they're high-confidence music commands
                    if (queryWords < 3 && !isMusicCommand) {
                        console.log(`[AI] Skipped: Query too short (${queryWords} words): "${query}"`);
                        return;
                    }
                    
                    if (triggerConfidence < 0.6) {
                        console.log(`[AI] Skipped: Low trigger confidence (${(triggerConfidence * 100).toFixed(0)}%): "${query}"`);
                        return;
                    }
                    
                    console.log(`[AI] Trigger confidence: ${(triggerConfidence * 100).toFixed(0)}%`);

                    if (query.length > 0) {
                        let shouldSkipAI = false;
                        
                        // Check intent classification to decide if we should route to music or AI
                        if (processed.intent === 'music' && processed.confidence > 0.6) {
                            console.log(`[Intent] Music command detected, skipping AI: "${query}"`);
                            // Try satellite control first
                            const intentParser = require('./intentParser');
                            const satelliteServer = require('./satelliteServer');
                            
                            try {
                                const intent = intentParser.parseIntent(query);
                                debugLog(`[Debug] Parsed intent:`, intent);
                                if (intent) {
                                    console.log(`[Satellite] Intent detected: ${intent.type}`);
                                    
                                    // Check if satellite is connected
                                    if (satelliteServer.hasConnection(userId)) {
                                        // Handle MEDIA_INFO query specially (needs response)
                                        if (intent.type === 'MEDIA_INFO') {
                                            // Play thinking sound
                                            const thinkingSound = path.join(__dirname, 'sounds', 'thinking.mp3');
                                            if (fs.existsSync(thinkingSound)) {
                                                playFile(guild.id, thinkingSound, 2000, 0.2);
                                            }

                                            // Query satellite for media info
                                            satelliteServer.query(userId, 'MEDIA_INFO').then(info => {
                                                if (info && info.title) {
                                                    const artist = info.artist ? `by ${info.artist}` : '';
                                                    const phrases = [
                                                        `You're listening to ${info.title} ${artist}.`,
                                                        `That's ${info.title} ${artist}.`,
                                                        `Playing ${info.title}.`
                                                    ];
                                                    speak(guild.id, phrases[Math.floor(Math.random() * phrases.length)]);
                                                } else {
                                                    speak(guild.id, "I can't tell what's playing right now.");
                                                }
                                            });
                                            shouldSkipAI = true;
                                        } else {
                                            // Standard one-way command (pause, play, skip, etc.)
                                            satelliteServer.sendCommand(userId, intent.type);
                                            const confirmations = ["On it.", "Sure.", "Done.", "You got it."];
                                            const msg = confirmations[Math.floor(Math.random() * confirmations.length)];
                                            speak(guild.id, msg);
                                            shouldSkipAI = true;
                                        }
                                    } else {
                                        console.log(`[Satellite] No connection for user ${userId}, falling back to AI.`);
                                        // Don't set shouldSkipAI - let AI handle it
                                    }
                                } else {
                                    debugLog(`[Debug] Intent was null/undefined, not skipping AI`);
                                }
                            } catch (err) {
                                console.error('[Satellite] Error parsing intent:', err);
                            }
                        }
                        
                        // Only proceed to AI if we didn't handle it as a music command
                        debugLog(`[Debug] shouldSkipAI = ${shouldSkipAI}`);
                        if (shouldSkipAI) {
                            debugLog(`[Debug] Returning early for music command`);
                            return; // Exit early for music commands
                        }
                        
                        console.log(`[AI] Triggered by ${username}: "${query}"`);

                        // Audio Cue (Thinking Sound)
                        const thinkingSound = path.join(__dirname, 'sounds', 'thinking.mp3');
                        if (fs.existsSync(thinkingSound)) {
                            playFile(guild.id, thinkingSound, 2000, 0.2); // Play for max 2s, 50% vol
                        }

                        // Call Gemini (Async, don't block main thread but prevent chatter trigger)
                        (async () => {
                            // 1. Get Memory Context (passing query for mentions)
                            const context = memory.getContext(userId, username, query);

                            // Get Current Status
                            const activities = guild.client.user.presence.activities;
                            const currentStatus = (activities && activities.length > 0) ? activities[0].name : "None";

                            const fullPrompt = `${context}\n[Your Current Status: "${currentStatus}"]\nUser: ${query}`;

                            // 2. Generate Response
                            const aiResponse = await gemini.generateResponse(fullPrompt);

                            if (aiResponse) {
                                console.log(`[AI] Response: "${aiResponse}"`);

                                // --- Status Check ---
                                let spokenResponse = aiResponse;
                                const statusRegex = /\[status:\s*"?(.*?)"?\]/i;
                                const statusMatch = aiResponse.match(statusRegex);
                                if (statusMatch) {
                                    const newStatus = statusMatch[1];
                                    console.log(`[Status] AI changing status to: "${newStatus}"`);
                                    try {
                                        // Need ActivityType.Playing or custom? default is Playing if not specified usually
                                        // However, discord.js requires ActivityType import if using enum. 
                                        // We can access it via guild.client.options or just hardcode? 
                                        // Easier to just use string for simplest override or get client from connection logic.
                                        // guild.client is reliable.
                                        // We need to import ActivityType from discord.js or valid integer.
                                        // 0 = Playing, 2 = Listening...? 
                                        // Let's assume Playing for simple text status or just setActivity(name) which defaults to Playing.
                                        guild.client.user.setActivity(newStatus);
                                    } catch (err) {
                                        console.error("Failed to set AI status:", err);
                                    }

                                    // Strip from spoken text
                                    spokenResponse = aiResponse.replace(statusRegex, '').trim();
                                }
                                // --------------------

                                speak(guild.id, spokenResponse);

                                // 3. Learn from interaction (Background)
                                memory.learnFromInteraction(userId, query, spokenResponse);
                            }
                        })();
                        return; // Skip Chatterbox logic
                    }
                }
            }

            // Chatterbox Logic
            if (storage.getChatterEnabled() && text.length > 2) {
                const now = Date.now();
                const lastChat = chatterCooldowns.get(guild.id) || 0;

                if (now - lastChat > COOLDOWN_MS) {
                    const lowerText = text.toLowerCase();
                    for (const [keyword, response] of Object.entries(chatterResponses)) {
                        if (lowerText.includes(keyword.toLowerCase())) {
                            console.log(`[Chatter] Triggered by "${keyword}" -> "${response}"`);
                            speak(guild.id, response);
                            chatterCooldowns.set(guild.id, now);
                            break;
                        }
                    }
                }
            }
        });

        // Cleanup on stream end
        pcmStream.on('close', () => { activeTranscriptions.delete(userId); });
        pcmStream.on('end', () => { activeTranscriptions.delete(userId); });
    });
}

let tempFiles = [];

async function leaveChannel(guildId) {
    if (connections.has(guildId)) {
        const connection = connections.get(guildId);
        connection.destroy();
        connections.delete(guildId);
        activeTranscriptions.clear();
        ttsQueues.delete(guildId);
        isSpeaking.delete(guildId);

        tempFiles.forEach(file => {
            if (fs.existsSync(file)) {
                try { fs.unlinkSync(file); } catch (e) { console.error('Error deleting temp file:', e); }
            }
        });
        tempFiles = [];
        return true;
    }
    return false;
}

// Play any audio file
async function playFile(guildId, filePath, duration = 0, volume = 1.0) {
    if (!connections.has(guildId)) return false;
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return false;
    }

    const connection = connections.get(guildId);
    try {
        const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary, inlineVolume: true });
        resource.volume.setVolume(volume);

        const player = createAudioPlayer();

        player.play(resource);
        connection.subscribe(player);

        let timeout = null;
        if (duration > 0) {
            timeout = setTimeout(() => {
                player.stop();
            }, duration);
        }

        return new Promise((resolve) => {
            player.on(AudioPlayerStatus.Idle, () => {
                player.stop();
                if (timeout) clearTimeout(timeout);
                resolve();
            });
            player.on('error', error => {
                console.error('Audio Player Error:', error);
                if (timeout) clearTimeout(timeout);
                resolve();
            });
        });
    } catch (error) {
        console.error("Error playing file:", error);
        return false;
    }
}


async function speak(guildId, text, args = {}) {
    if (!connections.has(guildId)) return false;

    // Handle legacy call: speak(id, text, 'en-US')
    let options = {};
    if (typeof args === 'string') {
        options = { code: args };
    } else {
        options = args || {};
    }

    // Resolve voice: User pref -> Global default -> Hard fallback
    // If code is in options, use it, otherwise check globals
    const effectiveCode = options.code || storage.getGlobalVoice() || 'en-US';
    options.code = effectiveCode;

    // Use TTS Handler to generate audio file
    try {
        const tempFile = await tts.generateSpeech(text, options);
        if (!tempFile || !fs.existsSync(tempFile)) {
            console.error("TTS failed to generate file.");
            return;
        }

        // Log to Transcript
        const styleLog = options.style ? `[${options.style}] ` : '';
        const logText = `${styleLog}${text}`;
        storage.saveTranscript("Mina 🤖", "BOT_TTS", logText);

        // Track for cleanup
        tempFiles.push(tempFile);

        // Add to Queue
        const queue = ttsQueues.get(guildId) || [];
        queue.push({ tempFile });
        ttsQueues.set(guildId, queue);

        processQueue(guildId);

        return true;

    } catch (e) {
        console.error("Error in speak:", e);
        return false;
    }
}

async function processQueue(guildId) {
    if (!connections.has(guildId)) return;
    if (isSpeaking.get(guildId)) return;

    const queue = ttsQueues.get(guildId);
    if (!queue || queue.length === 0) return;

    isSpeaking.set(guildId, true);
    const item = queue.shift(); // Get next item

    const connection = connections.get(guildId);

    try {
        const resource = createAudioResource(item.tempFile, { inputType: StreamType.Arbitrary, inlineVolume: true });
        const player = createAudioPlayer();
        activePlayers.set(guildId, player); // Track active player

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            player.stop();
            activePlayers.delete(guildId);
            // Cleanup file
            try {
                if (fs.existsSync(item.tempFile)) fs.unlinkSync(item.tempFile);
                tempFiles = tempFiles.filter(f => f !== item.tempFile);
            } catch (e) { console.error("Error deleting TTS file:", e); }

            isSpeaking.set(guildId, false);
            processQueue(guildId); // Play next
        });

        player.on('error', error => {
            console.error('Audio Player Error:', error);
            activePlayers.delete(guildId);
            isSpeaking.set(guildId, false);
            processQueue(guildId); // Play next
        });

    } catch (e) {
        console.error("Error processing queue item:", e);
        isSpeaking.set(guildId, false);
        processQueue(guildId);
    }
}

function stopTTS(guildId, clearQueue = false) {
    if (!connections.has(guildId)) return false;

    // 1. Clear Queue if requested
    if (clearQueue) {
        // Delete all queued files first?
        const queue = ttsQueues.get(guildId) || [];
        queue.forEach(item => {
            try { if (fs.existsSync(item.tempFile)) fs.unlinkSync(item.tempFile); } catch (e) { }
        });
        ttsQueues.set(guildId, []);
    }

    // 2. Stop current player (skips to next if queue not cleared)
    const player = activePlayers.get(guildId);
    if (player) {
        player.stop(); // Triggers Idle event, which cleans up current file and plays next (if any)
        return true;
    }
    return false;
}

function getBotChannelId(guildId) {
    if (connections.has(guildId)) {
        return connections.get(guildId).joinConfig.channelId;
    }
    return null;
}

async function greetNewUser(guildId, userId, member) {
    console.log(`[Greeting] Checking greeting for ${userId} in ${guildId}`);
    if (!connections.has(guildId)) {
        console.log(`[Greeting] No active connection for guild ${guildId}`);
        return;
    }
    if (storage.isOptedOut(userId)) {
        console.log(`[Greeting] User ${userId} opt-out`);
        return;
    }

    try {
        const profile = memory.getProfileData(userId);
        const name = profile.displayName || member.displayName;
        const facts = profile.facts.slice(0, 3).join(', ');

        const prompt = `
A user named "${name}" just joined the voice call where you are present.
User Facts: ${facts}

[Instructions]
- Say hello to them personally.
- Keep it VERY SHORT (1 sentence).
- MANDATORY: Mention that "voice transcription is on" or "recording is active".

Generate the spoken greeting:
`;
        const greeting = await gemini.generateResponse(prompt);
        if (greeting) {
            console.log(`[User Join Greeting] "${greeting}"`);
            speak(guildId, greeting);
        } else {
            speak(guildId, `Hello ${name}, voice transcription is active.`);
        }
    } catch (e) {
        console.error("User join greeting failed:", e);
    }
}

module.exports = {
    joinChannel,
    leaveChannel,
    speak,
    stopTTS,
    playFile,
    getBotChannelId,
    greetNewUser
};
