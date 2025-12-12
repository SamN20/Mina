const { SlashCommandBuilder } = require('discord.js');
const storage = require('../src/core/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toggleghost')
        .setDescription('Toggle Ghost Mode (Join/Leave announcements even when bot is offline) [Admin Only]'),
    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const currentState = storage.getGhostMode();
        const newState = !currentState;
        storage.setGhostMode(newState);

        await interaction.reply({
            content: `👻 **Ghost Mode** is now **${newState ? 'ON' : 'OFF'}**.\nThe bot will ${newState ? '' : 'no longer'} start briefly to play join/leave sounds.`,
            ephemeral: true
        });
    },
};
