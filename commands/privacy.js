const { SlashCommandBuilder } = require('discord.js');
const storage = require('../src/core/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('privacy')
        .setDescription('Manage your transcription privacy settings')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Opt-out to stop being recorded, Opt-in to resume')
                .setRequired(true)
                .addChoices(
                    { name: 'Opt-out (Stop Recording Me)', value: 'out' },
                    { name: 'Opt-in (Start Recording Me)', value: 'in' },
                )),
    async execute(interaction) {
        const action = interaction.options.getString('action');
        const userId = interaction.user.id;

        if (action === 'out') {
            storage.setOptOut(userId, true);
            await interaction.reply({ content: '🛑 You have opted out. The bot will ignore your voice from now on.', ephemeral: true });
        } else {
            storage.setOptOut(userId, false);
            await interaction.reply({ content: '✅ You have opted in. The bot will now transcribe your voice.', ephemeral: true });
        }
    },
};
