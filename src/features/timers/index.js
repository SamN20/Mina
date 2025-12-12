const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const intentClassifier = require('../../core/nlu/classifier');
const reminders = require('../reminders/store');
const numberToWords = require('../../utils/numberToWords');

registry.register({
    id: 'TIMER_SET',
    matcher: (text) => {
        return !!intentClassifier.parseTimer(text);
    },
    execute: async (text, context) => {
        const data = intentClassifier.parseTimer(text);

        // Add timer as reminder
        const reminder = reminders.addReminder(context.userId, "Timer is up!", data.remindAt);

        // Calculate duration string for confirmation
        const remindTime = new Date(data.remindAt);
        const now = new Date();
        const diffMs = remindTime - now;
        let diffDesc = "";
        const seconds = Math.round(diffMs / 1000);
        if (seconds < 60) {
            diffDesc = `${numberToWords(seconds)} seconds`;
        } else {
            const minutes = Math.round(seconds / 60);
            diffDesc = `${numberToWords(minutes)} minutes`;
        }

        return {
            [ActionType.TIMER_SET]: reminder, // Pass full object including 'message' and 'id'
            [ActionType.TTS_SPEAK]: `Timer set for ${diffDesc}.`
        };
    }
});
