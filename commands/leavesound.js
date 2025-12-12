const { SlashCommandBuilder } = require('discord.js');
const storage = require('../src/core/storage');
const path = require('path');
const fs = require('fs');
const https = require('https');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leavesound')
        .setDescription('Upload a custom sound to play when you LEAVE the voice channel')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('The audio file (mp3/wav/ogg, max 5s)')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Set for another user (Admin only)')
                .setRequired(false)),
    async execute(interaction) {
        const attachment = interaction.options.getAttachment('file');
        let targetUser = interaction.options.getUser('user') || interaction.user;

        // Admin check if setting for others
        if (targetUser.id !== interaction.user.id) {
            const adminIds = (process.env.ADMIN_IDS || '').split(',');
            if (!adminIds.includes(interaction.user.id)) {
                return interaction.reply({ content: '❌ You need Admin permissions to set sounds for others.', ephemeral: true });
            }
        }

        // Validate File Type
        const validExtensions = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/ogg'];
        if (!validExtensions.includes(attachment.contentType)) {
            return interaction.reply({ content: '❌ Invalid file type. Please upload MP3, WAV, or OGG.', ephemeral: true });
        }

        // Validate Size (e.g. max 2MB)
        if (attachment.size > 2 * 1024 * 1024) {
            return interaction.reply({ content: '❌ File too large. Max 2MB.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Ensure directory exists
        const soundsDir = path.resolve(__dirname, '../data/sounds');
        if (!fs.existsSync(soundsDir)) {
            fs.mkdirSync(soundsDir, { recursive: true });
        }

        // Filename: leavesound-USERID.ext
        const ext = path.extname(attachment.name) || '.mp3';
        const filename = `leavesound-${targetUser.id}${ext}`;
        const filePath = path.join(soundsDir, filename);

        // Download
        const file = fs.createWriteStream(filePath);
        https.get(attachment.url, (response) => {
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                storage.setLeaveSound(targetUser.id, filePath);
                interaction.editReply(`✅ Leave sound set for **${targetUser.username}**!`);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => { }); // Delete partial
            console.error(err);
            interaction.editReply('❌ Failed to download file.');
        });
    },
};
