const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const vision = require('../src/features/vision/api');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('look')
        .setDescription('Analyze an image (upload one or checks the last image in channel)')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Upload an image to analyze')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('What should I look for? (Optional)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Analysis mode')
                .setRequired(false)
                .addChoices(
                    { name: 'Describe', value: 'describe' },
                    { name: 'Read Text (OCR)', value: 'text' },
                    { name: 'Q&A', value: 'question' }
                )),
    async execute(interaction) {
        await interaction.deferReply();

        let targetUrl = null;
        const imageOption = interaction.options.getAttachment('image');
        const promptOption = interaction.options.getString('prompt') || "Describe this image.";
        const modeOption = interaction.options.getString('mode') || 'describe';

        // 1. Check direct upload
        if (imageOption) {
            if (!imageOption.contentType.startsWith('image/')) {
                return interaction.editReply('Only images are supported.');
            }
            targetUrl = imageOption.url;
        } else {
            // 2. Scan channel for last image
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            for (const [id, msg] of messages) {
                if (msg.attachments.size > 0) {
                    const first = msg.attachments.first();
                    if (first.contentType && first.contentType.startsWith('image/')) {
                        targetUrl = first.url;
                        break;
                    }
                }
                // Check embeds? (Often images are embeds)
                // For now, strict attachment check is safer/simpler
            }
        }

        if (!targetUrl) {
            return interaction.editReply('I couldn\'t find any images to look at.');
        }

        // 3. Analyze
        try {
            const start = Date.now();
            const result = await vision.analyzeImage(targetUrl, promptOption, modeOption);
            const timeTaken = ((Date.now() - start) / 1000).toFixed(1);

            // Phase 1.5: Store vision memory
            const userId = interaction.user.id;
            const memory = require('../src/core/memory');
            const profile = memory.getProfileData(userId);
            const displayName = profile.displayName || interaction.user.username;
            await vision.storeVisionMemory(userId, targetUrl, result, displayName);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Vision Analysis')
                .setDescription(result)
                .setThumbnail(targetUrl)
                .setFooter({ text: `Mode: ${modeOption} • ${timeTaken}s • Molmo-2-8b` });

            await interaction.editReply({ embeds: [embed] });

        } catch (e) {
            console.error(e);
            await interaction.editReply(`Error analyzing image: ${e.message}`);
        }
    },
};
