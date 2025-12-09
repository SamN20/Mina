const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('Download your transcription.')
        .addStringOption(option =>
            option.setName('format')
                .setDescription('Format to download')
                .setRequired(false)
                .addChoices(
                    { name: 'Text', value: 'txt' }
                )),
    async execute(interaction) {
        return interaction;
    },
};
