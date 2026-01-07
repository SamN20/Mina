const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(process.cwd(), 'data', 'transcripts');

if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function saveTranscript(username, userId, text, guildId = null) {
    const dateStr = getTodayString();
    // Structure: transcripts/YYYY-MM-DD/username-userId.txt
    const dayDir = path.join(BASE_DIR, dateStr);

    if (!fs.existsSync(dayDir)) {
        fs.mkdirSync(dayDir, { recursive: true });
    }

    // Sanitize username to remove illegal characters for Windows/Linux filenames
    const safeUsername = username.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeUsername}-${userId}.txt`;
    const filePath = path.join(dayDir, filename);

    const timestamp = new Date().toISOString(); // ISO for year precision
    const line = `[${timestamp}] ${text}\n`;

    fs.appendFile(filePath, line, (err) => {
        if (err) console.error('Error writing transcript:', err);
    });

    // Record words for wrapped
    try {
        const wrapped = require('../features/wrapped/store');
        wrapped.recordWords(text, userId === 'BOT_TTS' ? null : userId, guildId);
    } catch (e) { }
}

function getTranscriptPath(userId) {
    const dates = fs.readdirSync(BASE_DIR).sort().reverse();
    for (const date of dates) {
        const dayDir = path.join(BASE_DIR, date);
        const files = fs.readdirSync(dayDir);
        const userFile = files.find(f => f.includes(userId));
        if (userFile) {
            return path.join(dayDir, userFile);
        }
    }
    return null;
}

function logEvent(username, userId, eventType) {
    const today = new Date().toISOString().split('T')[0];
    const dayDir = path.join(BASE_DIR, today);

    if (!fs.existsSync(dayDir)) {
        fs.mkdirSync(dayDir, { recursive: true });
    }

    // Sanitize username
    const safeUsername = username.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeUsername}-${userId}.txt`;
    const filePath = path.join(dayDir, filename);

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] *** ${eventType} ***\n`;

    fs.appendFile(filePath, logLine, (err) => {
        if (err) console.error(`Error logging event:`, err);
    });
}

/**
 * Get the full conversation for a specific date (merged from all users)
 * @param {string} [dateStr] - YYYY-MM-DD, defaults to today
 * @param {number} [limitMinutes] - Only return lines from the last N minutes
 * @returns {string}
 */
function getDailyConversation(dateStr = null, limitMinutes = null) {
    const targetDate = dateStr || getTodayString();
    const dayDir = path.join(BASE_DIR, targetDate);

    if (!fs.existsSync(dayDir)) return "";

    const files = fs.readdirSync(dayDir).filter(f => f.endsWith('.txt'));
    let allLines = [];

    for (const file of files) {
        // Filename format: username-userId.txt
        const username = file.split('-').slice(0, -1).join('-'); // Handle hyphens in username
        const content = fs.readFileSync(path.join(dayDir, file), 'utf8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
            // line: [10:00:00 AM] Hello world
            const match = line.match(/^\[(.*?)\] (.*)$/);
            if (match) {
                const timestamp = match[1];
                const text = match[2];
                
                // Parse time
                const sortTime = new Date(`${targetDate} ${timestamp}`).getTime();

                allLines.push({
                    timestampStr: timestamp,
                    username: username,
                    text: text,
                    sortTime: sortTime
                });
            }
        }
    }

    // Sort by time
    allLines.sort((a, b) => a.sortTime - b.sortTime);

    // Filter by time limit if requested
    if (limitMinutes && limitMinutes > 0) {
        const cutoff = Date.now() - (limitMinutes * 60 * 1000);
        allLines = allLines.filter(l => l.sortTime >= cutoff);
    }

    // Format back to string
    return allLines.map(l => `[${l.timestampStr}] ${l.username}: ${l.text}`).join('\n');
}

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');
const LOGS_DIR = path.join(process.cwd(), 'data', 'logs');
let settings = {
    optedOut: [],
    voiceSettings: {},
    chatterEnabled: false,
    joinSounds: {},
    leaveSounds: {},
    globalVoice: 'en-US',
    ghostMode: false,
    aiEnabled: true,
    aiModel: null,
    triggerWords: ['mina', 'nina', 'tina'],
    debugMode: false,
    autoVoiceEnabled: true, // Default to true
    autoTextEnabled: true   // Default to true
};

// Load settings on startup
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        const loaded = JSON.parse(data);
        settings = { ...settings, ...loaded }; // Merge defaults
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function saveSettings() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

// --- Getters and Setters ---

function isOptedOut(userId) {
    return settings.optedOut.includes(userId);
}

function setOptOut(userId, optOut) {
    if (optOut) {
        if (!settings.optedOut.includes(userId)) {
            settings.optedOut.push(userId);
            saveSettings();
        }
    } else {
        const index = settings.optedOut.indexOf(userId);
        if (index > -1) {
            settings.optedOut.splice(index, 1);
            saveSettings();
        }
    }
}

function getVoice(userId) {
    return settings.voiceSettings[userId];
}

function setVoice(userId, langCode) {
    settings.voiceSettings[userId] = langCode;
    saveSettings();
}

function getChatterEnabled() {
    return settings.chatterEnabled || false;
}

function setChatterEnabled(enabled) {
    settings.chatterEnabled = enabled;
    saveSettings();
}

function getJoinSound(userId) {
    return settings.joinSounds ? settings.joinSounds[userId] : null;
}

function setJoinSound(userId, filePath) {
    if (!settings.joinSounds) settings.joinSounds = {};
    settings.joinSounds[userId] = filePath;
    saveSettings();
}

function getLeaveSound(userId) {
    return settings.leaveSounds ? settings.leaveSounds[userId] : null;
}

function setLeaveSound(userId, filePath) {
    if (!settings.leaveSounds) settings.leaveSounds = {};
    settings.leaveSounds[userId] = filePath;
    saveSettings();
}

function getGlobalVoice() {
    return settings.globalVoice || 'en-US';
}

function setGlobalVoice(voice) {
    settings.globalVoice = voice;
    saveSettings();
}

function getGhostMode() {
    return settings.ghostMode || false;
}

function setGhostMode(enabled) {
    settings.ghostMode = enabled;
    saveSettings();
}

function getAiEnabled() {
    return settings.aiEnabled !== false;
}

function setAiEnabled(enabled) {
    settings.aiEnabled = enabled;
    saveSettings();
}

function getAiModel() {
    return settings.aiModel;
}

function setAiModel(model) {
    settings.aiModel = model;
    saveSettings();
}

function getTriggerWords() {
    return settings.triggerWords || ['mina', 'meena', 'nina', 'mean', 'mena'];
}

function setTriggerWords(words) {
    if (Array.isArray(words)) {
        settings.triggerWords = words;
        saveSettings();
    }
}

function getDebugMode() {
    return settings.debugMode || false;
}

function setDebugMode(enabled) {
    settings.debugMode = enabled;
    saveSettings();
}

function getAutoVoiceEnabled() {
    return settings.autoVoiceEnabled !== false; // Default true
}

function setAutoVoiceEnabled(enabled) {
    settings.autoVoiceEnabled = enabled;
    saveSettings();
}

function getAutoTextEnabled() {
    return settings.autoTextEnabled !== false; // Default true
}

function setAutoTextEnabled(enabled) {
    settings.autoTextEnabled = enabled;
    saveSettings();
}

module.exports = {
    saveTranscript,
    logEvent,
    getDailyConversation,
    getTranscriptPath,
    isOptedOut,
    setOptOut,
    getVoice,
    setVoice,
    getChatterEnabled,
    setChatterEnabled,
    getJoinSound,
    setJoinSound,
    getLeaveSound,
    setLeaveSound,
    getGlobalVoice,
    setGlobalVoice,
    getGhostMode,
    setGhostMode,
    getAiEnabled,
    setAiEnabled,
    getAiModel,
    setAiModel,
    getTriggerWords,
    setTriggerWords,
    getDebugMode,
    setDebugMode,
    getAutoVoiceEnabled,
    setAutoVoiceEnabled,
    getAutoTextEnabled,
    setAutoTextEnabled
};
