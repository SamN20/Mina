const { SlashCommandBuilder } = require('discord.js');
const voiceHandler = require('../src/core/voice/handler');
const storage = require('../src/core/storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot speak text in the voice channel')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to speak')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('style')
                .setDescription('Emotion/Style (Azure Only)')
                .addChoices(
                    { name: 'Default', value: 'chat' },
                    { name: 'Cheerful', value: 'cheerful' },
                    { name: 'Sad', value: 'sad' },
                    { name: 'Angry', value: 'angry' },
                    { name: 'Whispering', value: 'whispering' },
                    { name: 'Affectionate', value: 'affectionate' }
                )),
    async execute(interaction) {
        const text = interaction.options.getString('message');
        const style = interaction.options.getString('style');
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        // Validation: Cap at 100 words
        if (text.split(/\s+/).length > 100) {
            return interaction.reply({
                content: '⚠️ Message too long! Please keep it under 100 words.',
                ephemeral: true
            });
        }

        // Acknowledge immediately
        await interaction.deferReply();

        try {
            // Pass options to speak
            // If user has a set voice, we might want to respect it, or override if style is present?
            // For now, let's pass style. voiceHandler logic will resolve the voice code.
            const speaking = await voiceHandler.speak(guildId, text, { style });

            if (speaking === false) {
                await interaction.editReply('I need to be in a voice channel first! Use /join.');
            } else {
                const styleText = style ? ` (${style})` : '';
                await interaction.editReply(`🗣️ **Said:** "${text}"${styleText}`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to speak.');
        }
    },
};
