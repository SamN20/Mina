const fs = require('fs');
const path = require('path');

const REMINDERS_FILE = path.join(process.cwd(), 'data', 'reminders.json');

// Ensure data dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'));
}

let reminders = [];

// Load reminders
if (fs.existsSync(REMINDERS_FILE)) {
    try {
        reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to load reminders:", e);
    }
}

function saveReminders() {
    try {
        fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
    } catch (e) {
        console.error("Failed to save reminders:", e);
    }
}

// Add a new reminder
function addReminder(userId, message, remindAt, type = 'time', guildId = null) {
    const reminder = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        userId,
        message,
        remindAt, // Can be null if type is 'on_join'
        type, // 'time' or 'on_join'
        createdAt: new Date().toISOString()
    };
    reminders.push(reminder);
    saveReminders();

    // Track in wrapped
    try {
        const wrapped = require('../wrapped/store');
        wrapped.incrReminderSet(userId, guildId);
    } catch (e) { }

    return reminder;
}

// Get reminders triggered by an event (and remove them!)
function getAndRemoveTriggeredReminders(userId, type, guildId = null) {
    const triggered = reminders.filter(r => r.userId === userId && r.type === type);
    if (triggered.length > 0) {
        reminders = reminders.filter(r => !(r.userId === userId && r.type === type));
        saveReminders();

        // Track in wrapped
        try {
            const wrapped = require('../wrapped/store');
            wrapped.incrReminderCompleted(userId, guildId, triggered.length);
        } catch (e) { }
    }
    return triggered;
}

// Remove a reminder
function removeReminder(reminderId) {
    const index = reminders.findIndex(r => r.id === reminderId);
    if (index > -1) {
        reminders.splice(index, 1);
        saveReminders();
        return true;
    }
    return false;
}

// Get reminders for a user
function getUserReminders(userId) {
    return reminders.filter(r => r.userId === userId);
}

// Get all active reminders (not yet triggered)
function getActiveReminders() {
    const now = new Date();
    return reminders.filter(r => new Date(r.remindAt) > now);
}

// Clean up old reminders (older than 24 hours past due date)
function cleanupOldReminders() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oldCount = reminders.length;
    reminders = reminders.filter(r => new Date(r.remindAt) > yesterday);
    if (reminders.length !== oldCount) {
        saveReminders();
        console.log(`[Reminders] Cleaned up ${oldCount - reminders.length} old reminders`);
    }
}

module.exports = {
    addReminder,
    removeReminder,
    getUserReminders,
    getActiveReminders,
    cleanupOldReminders,
    getAndRemoveTriggeredReminders
};
