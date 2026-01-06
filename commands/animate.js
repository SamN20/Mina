const { SlashCommandBuilder } = require('discord.js');
const satellite = require('../src/integrations/satellite');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animate')
        .setDescription('Make Mina perform an animation on her VRM model')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Animation name (e.g. wave, nod, samba, or custom filename)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('user')
                .setDescription('Target userId; leave blank to broadcast to all satellites')
                .setRequired(false))
        .addNumberOption(option =>
            option.setName('duration')
                .setDescription('Animation duration in seconds (default: based on clip)')
                .setRequired(false)
                .setMinValue(0.5)
                .setMaxValue(60.0)),

    async execute(interaction) {
        const animationName = interaction.options.getString('name');
        const targetUser = interaction.options.getString('user');
        const duration = interaction.options.getNumber('duration'); // Undefined is fine, client handles default

        // Play generic gesture/animation
        // We use 'playGesture' which emits the 'gesture' event. 
        // The client's AnimationManager will look up the name in its registry (native or loaded from server).
        const success = satellite.playGesture(targetUser, animationName, duration || 2.0);

        if (success) {
            await interaction.reply({
                content: `✨ Mina is performing: **${animationName}**`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ Failed to play animation. Make sure the VRM display is connected.`,
                ephemeral: true
            });
        }
    }
};
