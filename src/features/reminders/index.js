const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const intentClassifier = require('../../core/nlu/classifier');
const reminders = require('./store');
const numberToWords = require('../../utils/numberToWords');

// Register Reminder Command
registry.register({
    id: 'REMINDER_SET',
    matcher: (text) => {
        return !!intentClassifier.parseReminder(text);
    },
    execute: async (text, context) => {
        const data = intentClassifier.parseReminder(text);

        // Return ActionPlan
        // We calculate the confirmation text here or let the executor do it?
        // In the original code, it calculated text and also ADDED the reminder.
        // For safety, let's keep the side-effect here (adding reminder) 
        // and return the confirmation speech.

        const reminder = reminders.addReminder(context.userId, data.message, data.remindAt);

        // We need to calculate the confirmation message similar to original
        const diffMs = new Date(data.remindAt) - Date.now();
        const minutes = Math.round(diffMs / 60000);
        let timeDesc = "";
        if (minutes < 1) {
            const seconds = Math.round(diffMs / 1000);
            timeDesc = `${numberToWords(seconds)} seconds`;
        } else {
            timeDesc = `${numberToWords(minutes)} minutes`;
        }

        const responseText = `Set reminder for ${data.message} in ${timeDesc}.`;

        return {
            [ActionType.REMINDER_SET]: reminder, // Pass full object
            [ActionType.TTS_SPEAK]: `Set reminder for ${data.message} in ${timeDesc}.`
        };
    }
});
