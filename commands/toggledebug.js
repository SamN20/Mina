const { SlashCommandBuilder } = require('discord.js');
const storage = require('../src/core/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toggledebug')
        .setDescription('Toggle debug logging (Admin Only)'),
    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const currentState = storage.getDebugMode();
        const newState = !currentState;
        storage.setDebugMode(newState);

        await interaction.reply({
            content: `🐛 Debug logging has been **${newState ? 'ENABLED' : 'DISABLED'}**.`,
            ephemeral: false
        });
    },
};
