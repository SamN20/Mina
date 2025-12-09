const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins your voice channel and starts transcribing.')
        .addBooleanOption(option =>
            option.setName('silent')
                .setDescription('Join without a personalized greeting (only warning)')
        ),
    async execute(interaction) {
        // Logic handled in main file or voice handler, but we need to trigger it
        // We will pass the interaction to the voice handler
        return interaction;
    },
};
