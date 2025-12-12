/**
 * @typedef {Object} ActionPlan
 * @property {string} [speak] - Text to speak (TTS)
 * @property {string} [playFile] - Path to audio file to play
 * @property {Object} [satelliteCommand] - Command to send to satellite
 * @property {string} satelliteCommand.type - Command type (e.g. MEDIA_PLAY)
 * @property {Object} [reminder] - Reminder to set
 * @property {string} reminder.message
 * @property {string} reminder.remindAt - ISO date string
 * @property {Object} [timer]
 * @property {number} timer.durationSeconds
 * @property {Object} [metadata]
 * @property {boolean} [metadata.shouldContinueListening]
 */

/**
 * @typedef {Object} Intent
 * @property {string} type - Intent type (e.g. MUSIC, CHAT, REMINDER)
 * @property {number} confidence - 0-1
 * @property {Object} [data] - Extract data
 */

const ActionType = {
    TTS_SPEAK: 'TTS_SPEAK',
    PLAY_FILE: 'PLAY_FILE',
    SATELLITE_CMD: 'SATELLITE_CMD',
    REMINDER_SET: 'REMINDER_SET',
    TIMER_SET: 'TIMER_SET'
};

const IntentType = {
    MUSIC: 'MUSIC',
    CHAT: 'CHAT',
    REMINDER: 'REMINDER',
    TIMER: 'TIMER',
    UNKNOWN: 'UNKNOWN'
};

module.exports = {
    ActionType,
    IntentType
};
