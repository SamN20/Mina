const fs = require('fs');
const path = require('path');

const BASE = path.join(process.cwd(), 'data', 'wrapped');
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });

function getYear() {
    return new Date().getFullYear().toString();
}

function yearFile(year) {
    const dir = path.join(BASE, year);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'wrapped.json');
}

function load(year) {
    const file = yearFile(year);
    if (!fs.existsSync(file)) return { users: {}, servers: {}, sessionsActive: {} };
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        // Ensure structure
        if (!data.users) data.users = {};
        if (!data.servers) data.servers = {};
        if (!data.sessionsActive) data.sessionsActive = {};
        // Ensure all users and servers have full structure
        for (const userId of Object.keys(data.users)) {
            ensureUser(data, userId);
        }
        for (const guildId of Object.keys(data.servers)) {
            ensureServer(data, guildId);
        }
        return data;
    } catch (e) {
        console.error('[Wrapped] failed to load', e);
        return { users: {}, servers: {}, sessionsActive: {} };
    }
}

function save(year, data) {
    try {
        fs.writeFileSync(yearFile(year), JSON.stringify(data, null, 2));
    } catch (e) { console.error('[Wrapped] failed to save', e); }
}

function ensureUser(data, userId) {
    if (!data.users[userId]) {
        data.users[userId] = { messages: 0, commands: {}, tts: 0, voiceMinutes: 0, voiceSessions: [], reactions: 0, aiInteractions: 0, moods: {}, games: {}, channels: {}, remindersSet: 0, remindersCompleted: 0, topWords: {}, hourlyActivity: {} };
    } else {
        // Ensure substructures exist
        const user = data.users[userId];
        if (!user.commands) user.commands = {};
        if (!user.voiceSessions) user.voiceSessions = [];
        if (!user.moods) user.moods = {};
        if (!user.games) user.games = {};
        if (!user.channels) user.channels = {};
        if (!user.topWords) user.topWords = {};
        if (typeof user.remindersSet !== 'number') user.remindersSet = 0;
        if (typeof user.remindersCompleted !== 'number') user.remindersCompleted = 0;
        if (!user.hourlyActivity) user.hourlyActivity = {};
    }
    return data.users[userId];
}

function ensureServer(data, guildId) {
    if (!data.servers[guildId]) {
        data.servers[guildId] = { messages: 0, commands: {}, tts: 0, voiceMinutes: 0, voiceSessions: [], reactions: 0, aiInteractions: 0, moods: {}, games: {}, channels: {}, remindersSet: 0, remindersCompleted: 0, topWords: {}, hourlyActivity: {} };
    } else {
        // Ensure substructures exist
        const server = data.servers[guildId];
        if (!server.commands) server.commands = {};
        if (!server.voiceSessions) server.voiceSessions = [];
        if (!server.moods) server.moods = {};
        if (!server.games) server.games = {};
        if (!server.channels) server.channels = {};
        if (!server.topWords) server.topWords = {};
        if (typeof server.remindersSet !== 'number') server.remindersSet = 0;
        if (typeof server.remindersCompleted !== 'number') server.remindersCompleted = 0;
        if (!server.hourlyActivity) server.hourlyActivity = {};
    }
    return data.servers[guildId];
}

function recordHourlyActivity(userId, guildId, hour) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.hourlyActivity[hour] = (user.hourlyActivity[hour] || 0) + 1;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.hourlyActivity[hour] = (server.hourlyActivity[hour] || 0) + 1;
    }
    save(year, data);
}

function incrMessage(userId, guildId, channelId, amount = 1) {
    const year = getYear();
    const data = load(year);
    const hour = new Date().getHours();
    if (userId) {
        const user = ensureUser(data, userId);
        user.messages = (user.messages || 0) + amount;
        if (channelId) {
            if (!user.channels[channelId]) user.channels[channelId] = { messages: 0, voiceMinutes: 0 };
            user.channels[channelId].messages += amount;
        }
        user.hourlyActivity[hour] = (user.hourlyActivity[hour] || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.messages = (server.messages || 0) + amount;
        if (channelId) {
            if (!server.channels[channelId]) server.channels[channelId] = { messages: 0, voiceMinutes: 0 };
            server.channels[channelId].messages += amount;
        }
        server.hourlyActivity[hour] = (server.hourlyActivity[hour] || 0) + amount;
    }
    save(year, data);
}

function incrCommand(userId, guildId, commandName, amount = 1) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.commands[commandName] = (user.commands[commandName] || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.commands[commandName] = (server.commands[commandName] || 0) + amount;
    }
    save(year, data);
}

function incrTTS(guildId, userId = null, amount = 1) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.tts = (user.tts || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.tts = (server.tts || 0) + amount;
    }
    save(year, data);
}

function startVoiceSession(userId, guildId, channelId) {
    const year = getYear();
    const data = load(year);
    if (!data.sessionsActive) data.sessionsActive = {};
    data.sessionsActive[userId] = { guildId, channelId, start: Date.now() };
    save(year, data);
}

function incrReaction(userId, guildId, amount = 1) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.reactions = (user.reactions || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.reactions = (server.reactions || 0) + amount;
    }
    save(year, data);
}

function incrAIInteraction(userId, guildId, amount = 1) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.aiInteractions = (user.aiInteractions || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.aiInteractions = (server.aiInteractions || 0) + amount;
    }
    save(year, data);
}

function incrReminderSet(userId, guildId, amount = 1) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.remindersSet = (user.remindersSet || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.remindersSet = (server.remindersSet || 0) + amount;
    }
    save(year, data);
}

function incrReminderCompleted(userId, guildId, amount = 1) {
    const year = getYear();
    const data = load(year);
    if (userId) {
        const user = ensureUser(data, userId);
        user.remindersCompleted = (user.remindersCompleted || 0) + amount;
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        server.remindersCompleted = (server.remindersCompleted || 0) + amount;
    }
    save(year, data);
}

function recordWords(text, userId, guildId) {
    const year = getYear();
    const data = load(year);
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    if (userId) {
        const user = ensureUser(data, userId);
        for (const word of words) {
            user.topWords[word] = (user.topWords[word] || 0) + 1;
        }
    }
    if (guildId) {
        const server = ensureServer(data, guildId);
        for (const word of words) {
            server.topWords[word] = (server.topWords[word] || 0) + 1;
        }
    }
    save(year, data);
}

function endVoiceSession(userId) {
    const year = getYear();
    const data = load(year);
    if (!data.sessionsActive || !data.sessionsActive[userId]) return null;
    const session = data.sessionsActive[userId];
    const durationMs = Date.now() - session.start;
    const minutes = Math.round(durationMs / 60000);
    const hour = new Date().getHours();

    // record to user
    const user = ensureUser(data, userId);
    user.voiceMinutes = (user.voiceMinutes || 0) + minutes;
    user.voiceSessions = user.voiceSessions || [];
    user.voiceSessions.push({ guildId: session.guildId, channelId: session.channelId, start: session.start, durationMs });
    if (session.channelId) {
        if (!user.channels[session.channelId]) user.channels[session.channelId] = { messages: 0, voiceMinutes: 0 };
        user.channels[session.channelId].voiceMinutes += minutes;
    }
    user.hourlyActivity[hour] = (user.hourlyActivity[hour] || 0) + 1;

    // record to server
    const server = ensureServer(data, session.guildId);
    server.voiceMinutes = (server.voiceMinutes || 0) + minutes;
    if (session.channelId) {
        if (!server.channels[session.channelId]) server.channels[session.channelId] = { messages: 0, voiceMinutes: 0 };
        server.channels[session.channelId].voiceMinutes += minutes;
    }
    server.hourlyActivity[hour] = (server.hourlyActivity[hour] || 0) + 1;

    // clear active
    delete data.sessionsActive[userId];
    save(year, data);
    return { minutes, durationMs };
}

function recordGame(userId, gameName) {
    const year = getYear();
    const data = load(year);
    const user = ensureUser(data, userId);
    user.games[gameName] = (user.games[gameName] || 0) + 1;
    save(year, data);
}

function setMood(userId, mood) {
    const year = getYear();
    const data = load(year);
    const user = ensureUser(data, userId);
    user.moods[mood] = (user.moods[mood] || 0) + 1;
    save(year, data);
}

module.exports = {
    incrMessage,
    incrCommand,
    incrTTS,
    incrReaction,
    incrAIInteraction,
    incrReminderSet,
    incrReminderCompleted,
    recordWords,
    recordGame,
    setMood,
    startVoiceSession,
    endVoiceSession,
    loadYear: (y) => load(y || getYear())
};
