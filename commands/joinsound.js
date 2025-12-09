const { SlashCommandBuilder } = require('discord.js');
const storage = require('../storage');
const fs = require('fs');
const path = require('path');
const https = require('https');

const THEMES_DIR = path.join(__dirname, '../sounds/themes');
if (!fs.existsSync(THEMES_DIR)) {
    fs.mkdirSync(THEMES_DIR, { recursive: true });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joinsound')
        .setDescription('Upload a sound to play when a user joins the voice channel')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('The audio file (MP3/WAV, max 10s recommended)')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user this sound is for (Defaults to you)')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const attachment = interaction.options.getAttachment('file');

        // Validate file type
        if (!attachment.contentType?.startsWith('audio/')) {
            return interaction.editReply('❌ Please upload a valid audio file.');
        }

        // Generate safe filename
        const extension = path.extname(attachment.name) || '.mp3';
        const filename = `${targetUser.id}${extension}`;
        const filePath = path.join(THEMES_DIR, filename);

        // Download file
        const fileStream = fs.createWriteStream(filePath);
        https.get(attachment.url, (response) => {
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                // Save setting
                storage.setJoinSound(targetUser.id, filePath);
                interaction.editReply(`✅ **Join Sound Set!**\nWhenever **${targetUser.tag}** joins the channel, this sound will play.`);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => { }); // Delete partial file
            console.error(err);
            interaction.editReply('❌ Failed to download the file.');
        });
    },
};
