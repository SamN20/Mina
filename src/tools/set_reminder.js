const reminders = require('../features/reminders/store');

module.exports = {
    definition: {
        type: 'function',
        function: {
            name: 'set_reminder',
            description: 'Set a reminder for a specific time or duration.',
            parameters: {
                type: 'object',
                properties: {
                    message: {
                        type: 'string',
                        description: 'The content of the reminder.'
                    },
                    minutes: {
                        type: 'integer',
                        description: 'How many minutes from now to set the reminder for (e.g. 10, 60).'
                    }
                },
                required: ['message', 'minutes']
            }
        }
    },
    execute: async ({ message, minutes }, context) => {
        if (!context || !context.userId) {
            return "Error: User identification missing. Cannot set reminder.";
        }

        if (!minutes || minutes <= 0) {
            return "Please specify a positive number of minutes.";
        }

        const ms = minutes * 60 * 1000;
        const remindAt = new Date(Date.now() + ms);

        reminders.addReminder(context.userId, message, remindAt.toISOString(), 'time', context.guildId);

        return `Reminder set for "${message}" in ${minutes} minutes.`;
    }
};
