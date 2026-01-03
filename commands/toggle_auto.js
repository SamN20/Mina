const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const storage = require('../src/core/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toggle_auto')
        .setDescription('Enable or disable auto-conversation features')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Which auto-reply feature to toggle')
                .setRequired(true)
                .addChoices(
                    { name: 'Voice Chat Auto-Reply', value: 'voice' },
                    { name: 'Text Chat Auto-Reply', value: 'text' }
                ))
        .addBooleanOption(option =>
            option.setName('enabled')
                .setDescription('Enable or Disable')
                .setRequired(true)),
    
    async execute(interaction) {
        const type = interaction.options.getString('type');
        const enabled = interaction.options.getBoolean('enabled');

        if (type === 'voice') {
            storage.setAutoVoiceEnabled(enabled);
            await interaction.reply({ 
                content: `Auto-Reply for **Voice Chat** has been ${enabled ? 'ENABLED' : 'DISABLED'}.`,
                ephemeral: false 
            });
        } else if (type === 'text') {
            storage.setAutoTextEnabled(enabled);
            await interaction.reply({ 
                content: `Auto-Reply for **Text Chat** has been ${enabled ? 'ENABLED' : 'DISABLED'}.`,
                ephemeral: false 
            });
        }
    }
};
