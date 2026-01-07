const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(process.cwd(), 'data', 'history.json');
const MAX_HISTORY_LENGTH = 50;

// Ensure data dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'));
}

let history = {};

// Load history
if (fs.existsSync(HISTORY_FILE)) {
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error("Failed to save history:", e);
    }
}

/**
 * Add a message to the history
 * @param {string} userId - User ID or Context ID
 * @param {string} role - 'user' or 'assistant' or 'system'
 * @param {string} content - Message content
 * @param {string} name - Optional display name
 */
function add(userId, role, content, name) {
    if (!history[userId]) {
        history[userId] = [];
    }

    const entry = {
        role,
        content,
        timestamp: Date.now()
    };

    if (name) entry.name = name;

    history[userId].push(entry);

    // Trim
    if (history[userId].length > MAX_HISTORY_LENGTH) {
        history[userId] = history[userId].slice(-MAX_HISTORY_LENGTH);
    }

    saveHistory();
}

/**
 * Get history for a user
 * @param {string} userId 
 * @returns {Array} List of { role, content, timestamp, name? }
 */
function get(userId) {
    return history[userId] || [];
}

/**
 * Clear history for a user
 * @param {string} userId 
 */
function clear(userId) {
    if (history[userId]) {
        delete history[userId];
        saveHistory();
    }
}

module.exports = {
    add,
    get,
    clear
};
