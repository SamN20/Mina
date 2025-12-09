const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setpfp')
        .setDescription('Change the bot\'s profile picture (Admin Only)')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('The new profile picture')
                .setRequired(true)),
    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const image = interaction.options.getAttachment('image');

        // Basic validation
        if (!image.contentType || !image.contentType.startsWith('image/')) {
            return interaction.reply({
                content: '❌ Please upload a valid image file.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            await interaction.client.user.setAvatar(image.url);
            await interaction.editReply({ content: '✅ Bot profile picture updated successfully!' });
        } catch (error) {
            console.error('Error setting avatar:', error);
            if (error.code === 50035) {
                await interaction.editReply({ content: '❌ Error: You are changing the avatar too fast (Discord Rate Limit) or the file is invalid.' });
            } else {
                await interaction.editReply({ content: `❌ Failed to update profile picture: ${error.message}` });
            }
        }
    },
};
