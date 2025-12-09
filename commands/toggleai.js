const { SlashCommandBuilder } = require('discord.js');
const storage = require('../storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toggleai')
        .setDescription('Toggle the AI Chatbot (Pineapple) features (Admin Only)'),
    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const currentState = storage.getAiEnabled();
        const newState = !currentState;
        storage.setAiEnabled(newState);

        await interaction.reply({
            content: `🤖 AI Chatbot features have been **${newState ? 'ENABLED' : 'DISABLED'}**.`,
            ephemeral: false
        });
    },
};
