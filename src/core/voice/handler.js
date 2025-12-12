const { EndBehaviorType, VoiceConnectionStatus } = require('@discordjs/voice');
const prism = require('prism-media');
const transcription = require('../../integrations/transcription');
const storage = require('../storage');
const tts = require('../../integrations/tts');
const gemini = require('../../integrations/ai');
const memory = require('../memory');
const intentClassifier = require('../nlu/classifier');
const reminders = require('../../features/reminders/store');
const pipeline = require('../pipeline/handleUtterance');
const { ActionType } = require('../types');
const satelliteServer = require('../../integrations/satellite');
const audio = require('../../integrations/discord/audio');
const greetings = require('../../features/greetings');
const scheduler = require('../../features/reminders/scheduler');

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// State Maps (Reduced)
const activeTranscriptions = new Set(); // UserId
// Chatterbox stuff
const chatterCooldowns = new Map();
const COOLDOWN_MS = 10000;
let chatterResponses = {};
try {
    // Fix: Path relative to CWD
    const responsesPath = path.join(process.cwd(), 'data', 'responses.json');
    if (fs.existsSync(responsesPath)) chatterResponses = JSON.parse(fs.readFileSync(responsesPath, 'utf8'));
} catch (e) { }

module.exports = {
    joinChannel,
    leaveChannel,
    playFile: audio.playFile, // Proxy
    speak: audio.speak,       // Proxy
    scheduleReminder: scheduler.scheduleReminder,
    getBotChannelId: function (guildId) {
        const conn = audio.getConnection(guildId);
        return conn ? conn.joinConfig.channelId : null;
    },
    greetNewUser: greetings.greetNewUser
};

// --- Action Execution ---
// --- Action Execution ---
async function executePlan(plan, guildId, userId, client) {
    if (!plan) return;

    if (plan[ActionType.SATELLITE_CMD] && userId) {
        const cmd = plan[ActionType.SATELLITE_CMD];
        satelliteServer.sendCommand(userId, cmd.command);
    }
    if (plan[ActionType.TTS_SPEAK]) {
        await audio.speak(guildId, plan[ActionType.TTS_SPEAK]);
    }
    if (plan[ActionType.PLAY_FILE]) {
        await audio.playFile(guildId, plan[ActionType.PLAY_FILE]);
    }

    // SCHEDULING FIX
    if (plan[ActionType.REMINDER_SET]) {
        scheduler.scheduleReminder(client, guildId, userId, plan[ActionType.REMINDER_SET]);
    }
    if (plan[ActionType.TIMER_SET]) {
        scheduler.scheduleReminder(client, guildId, userId, plan[ActionType.TIMER_SET]);
    }
}

// --- Interaction Handlers ---

async function joinChannel(interaction) {
    const channel = interaction.member.voice.channel;
    if (!channel) return interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });

    await interaction.deferReply();

    // 1. Join Audio using Audio Manager
    const connection = audio.join(channel);

    // 2. Setup Transcriber
    connection.once(VoiceConnectionStatus.Ready, () => {
        console.log(`Connected to ${channel.name}`);
        startListening(connection, channel.guild);

        // 3. Trigger Greeting Feature
        const isSilent = interaction.options ? interaction.options.getBoolean('silent') : false;
        greetings.greetGroupOnJoin(channel, isSilent);
    });

    // 4. UI Feedback
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎙️ Live Transcription Active')
        .setDescription(`Joined **${channel.name}** and listening to all users.\nTranscripts are being saved locally.`)
        .addFields({ name: 'Status', value: '🟢 Transcribing', inline: true });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('toggle_chatter').setLabel('🦜 Toggle Chatter').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('leave_voice').setLabel('Stop & Leave').setStyle(ButtonStyle.Danger),
        );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function leaveChannel(guildId) {
    return audio.leave(guildId);
}

// --- Listening Logic ---

function startListening(connection, guild) {
    const receiver = connection.receiver;
    receiver.speaking.removeAllListeners('start');

    receiver.speaking.on('start', (userId) => {
        if (!userId || storage.isOptedOut(userId)) return;
        if (activeTranscriptions.has(userId)) return;
        activeTranscriptions.add(userId);

        const opusStream = receiver.subscribe(userId, {
            end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
        });

        opusStream.on('error', () => activeTranscriptions.delete(userId));

        const decoder = new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 });
        const pcmStream = opusStream.pipe(decoder);

        pcmStream.on('error', () => activeTranscriptions.delete(userId));
        pcmStream.on('close', () => activeTranscriptions.delete(userId));
        pcmStream.on('end', () => activeTranscriptions.delete(userId));

        const member = guild.members.cache.get(userId);
        const username = member ? member.displayName : userId;

        transcription.transcribeStream(pcmStream, userId, async (uid, text) => {
            // Save Transcript (Restored)
            storage.saveTranscript(username, uid, text);

            // 1. Handle Pipeline
            const context = {
                userId,
                guildId: guild.id,
                username,
                guildName: guild.name,
                member,
                client: guild.client,
                currentStatus: guild.client.user.presence.activities[0]?.name
            };

            try {
                // Immediate Feedback: Check for wake word to play "Thinking" sound
                // This mimics the original behavior of confirming we heard you.
                const preCheck = intentClassifier.processTranscription(text);
                // "chat" intent means generic AI, so trigger confidence matters.
                // "music/reminder" intents are specific commands.
                if (preCheck.intent && (preCheck.intent !== 'chat' || preCheck.triggerConfidence >= 0.6)) {
                    audio.playFile(guild.id, path.join(process.cwd(), 'data', 'sounds', 'thinking.mp3'));
                }

                const plan = await pipeline.handleUtterance(text, context);

                if (plan && Object.keys(plan).length > 0) {
                    await executePlan(plan, guild.id, userId, guild.client);
                    return; // Handled by pipeline
                }
            } catch (e) {
                console.error("Pipeline Error:", e);
            }

            // 2. Legacy Chatterbox Fallback
            if (storage.getChatterEnabled() && text.length > 2) {
                const now = Date.now();
                const lastChat = chatterCooldowns.get(guild.id) || 0;
                if (now - lastChat > COOLDOWN_MS) {
                    const lowerText = text.toLowerCase();
                    for (const [keyword, response] of Object.entries(chatterResponses)) {
                        if (lowerText.includes(keyword.toLowerCase())) {
                            console.log(`[Chatter] Triggered by "${keyword}"`);
                            audio.speak(guild.id, response);
                            chatterCooldowns.set(guild.id, now);
                            break;
                        }
                    }
                }
            }
        });
    });
}
