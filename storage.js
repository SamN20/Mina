const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, 'transcripts');

if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function saveTranscript(username, userId, text) {
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

    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${text}\n`;

    fs.appendFile(filePath, line, (err) => {
        if (err) console.error('Error writing transcript:', err);
    });
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

    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] *** ${eventType} ***\n`;

    fs.appendFile(filePath, logLine, (err) => {
        if (err) console.error(`Error logging event:`, err);
    });
}

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
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
    debugMode: false
};

// Load settings on startup
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        settings = JSON.parse(data);
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

module.exports = {
    saveTranscript,
    logEvent,
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
    setDebugMode
};
