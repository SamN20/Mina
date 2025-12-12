const { SlashCommandBuilder } = require('discord.js');
const storage = require('../src/core/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chatter')
        .setDescription('Toggle Chatterbox Mode (Bot responds to keywords)')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Turn Chatterbox on or off')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'on' },
                    { name: 'Disable', value: 'off' }
                )),
    async execute(interaction) {
        const status = interaction.options.getString('status');
        const enabled = status === 'on';

        storage.setChatterEnabled(enabled);

        await interaction.reply({
            content: `🦜 **Chatterbox Mode is now ${enabled ? 'ENABLED' : 'DISABLED'}**.\n${enabled ? 'I will now respond to certain keywords!' : 'I will stay quiet.'}`,
            ephemeral: false
        });
    },
};
