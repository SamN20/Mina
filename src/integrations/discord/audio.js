const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    StreamType,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    enterState
} = require('@discordjs/voice');
const fs = require('fs');
const tts = require('../tts');
const storage = require('../../core/storage');

// State Maps
const connections = new Map(); // GuildId -> Connection
const ttsQueues = new Map(); // GuildId -> Array of { tempFile }
const isSpeaking = new Map(); // GuildId -> Boolean
const activePlayers = new Map(); // GuildId -> AudioPlayer
let tempFiles = [];

// Exports
module.exports = {
    join,
    leave,
    speak,
    playFile,
    getConnection,
    getVoiceConnectionStatus: VoiceConnectionStatus
};

/**
 * Join a voice channel
 * @param {import('discord.js').VoiceChannel} channel 
 */
function join(channel) {
    if (connections.has(channel.guild.id)) {
        try { connections.get(channel.guild.id).destroy(); } catch (e) { }
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

    // Auto-cleanup on disconnect
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                enterState(connection, VoiceConnectionStatus.Signalling, 5_000),
                enterState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch (error) {
            console.log(`[Audio] Disconnected from ${channel.guild.id}`);
            cleanup(channel.guild.id);
        }
    });

    return connection;
}

/**
 * Leave a voice channel
 * @param {string} guildId 
 */
function leave(guildId) {
    if (connections.has(guildId)) {
        cleanup(guildId);
        return true;
    }
    return false;
}

function cleanup(guildId) {
    const connection = connections.get(guildId);
    if (connection) {
        try { connection.destroy(); } catch (e) { }
        connections.delete(guildId);
    }

    ttsQueues.delete(guildId);
    isSpeaking.delete(guildId);
    activePlayers.delete(guildId);

    // Clean temp files
    // Ideally we track which file belongs to which guild, but for now clear all known temp files?
    // Or just let them pile up until process exit? 
    // The original code cleared ALL tempFiles on leaveChannel.
    cleanTempFiles();
}

function cleanTempFiles() {
    tempFiles.forEach(file => {
        if (fs.existsSync(file)) {
            try { fs.unlinkSync(file); } catch (e) { console.error('Error deleting temp file:', e); }
        }
    });
    tempFiles = [];
}

/**
 * Get active connection
 * @param {string} guildId 
 */
function getConnection(guildId) {
    return connections.get(guildId);
}

/**
 * Speak text using TTS
 * @param {string} guildId 
 * @param {string} text 
 * @param {Object|string} [args]
 */
async function speak(guildId, text, args = {}) {
    if (!connections.has(guildId)) return false;

    // Options logic
    let options = {};
    if (typeof args === 'string') {
        options = { code: args };
    } else {
        options = args || {};
    }

    const effectiveCode = options.code || storage.getGlobalVoice() || 'en-US';
    options.code = effectiveCode;

    try {
        const tempFile = await tts.generateSpeech(text, options);
        if (!tempFile || !fs.existsSync(tempFile)) {
            console.error("TTS failed to generate file.");
            return false;
        }

        // Log
        const styleLog = options.style ? `[${options.style}] ` : '';
        storage.saveTranscript("Mina 🤖", "BOT_TTS", `${styleLog}${text}`);

        tempFiles.push(tempFile);

        const queue = ttsQueues.get(guildId) || [];

        // Return promise that resolves when THIS item finishes playing
        return new Promise((resolve) => {
            queue.push({ tempFile, resolve });
            ttsQueues.set(guildId, queue);
            processQueue(guildId);
        });

    } catch (e) {
        console.error("Error in speak:", e);
        return false;
    }
}

function processQueue(guildId) {
    if (!connections.has(guildId)) return;
    if (isSpeaking.get(guildId)) return;

    const queue = ttsQueues.get(guildId);
    if (!queue || queue.length === 0) return;

    isSpeaking.set(guildId, true);
    const item = queue.shift();

    const connection = connections.get(guildId);

    try {
        const resource = createAudioResource(item.tempFile, { inputType: StreamType.Arbitrary, inlineVolume: true });
        const player = createAudioPlayer();
        activePlayers.set(guildId, player);

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            player.stop();
            activePlayers.delete(guildId);
            isSpeaking.set(guildId, false);

            // Delete file immediately?
            try {
                if (fs.existsSync(item.tempFile)) fs.unlinkSync(item.tempFile);
                tempFiles = tempFiles.filter(f => f !== item.tempFile);
            } catch (e) { }

            // Resolve the promise for this item
            if (item.resolve) item.resolve(true);

            processQueue(guildId);
        });

        player.on('error', error => {
            console.error('Player Error:', error);
            activePlayers.delete(guildId);
            isSpeaking.set(guildId, false);
            if (item.resolve) item.resolve(false);
            processQueue(guildId);
        });

    } catch (e) {
        console.error("Error processing queue:", e);
        isSpeaking.set(guildId, false);
        if (item.resolve) item.resolve(false);
        processQueue(guildId);
    }
}

/**
 * Play an audio file found on disk
 * @param {string} guildId 
 * @param {string} filePath 
 * @param {number} duration 
 * @param {number} volume 
 */
async function playFile(guildId, filePath, duration = 0, volume = 1.0) {
    if (!connections.has(guildId)) return false;
    if (!fs.existsSync(filePath)) return false;

    const connection = connections.get(guildId);
    try {
        const resource = createAudioResource(filePath, { inputType: StreamType.Arbitrary, inlineVolume: true });
        resource.volume.setVolume(volume);

        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);

        let timeout = null;
        if (duration > 0) {
            timeout = setTimeout(() => { player.stop(); }, duration);
        }

        return new Promise((resolve) => {
            player.on(AudioPlayerStatus.Idle, () => {
                player.stop();
                if (timeout) clearTimeout(timeout);
                resolve();
            });
            player.on('error', () => resolve());
        });
    } catch (e) {
        console.error("playFile Error:", e);
        return false;
    }
}
