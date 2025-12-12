const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const storage = require('../src/core/storage');
const edge = require('../src/integrations/tts/engines/edge');
const azure = require('../src/integrations/tts/engines/azure');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setglobalvoice')
        .setDescription('Set the default TTS voice for the entire bot (Admin Only)'),
    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const engine = process.env.TTS_ENGINE || 'gtts';
        let options = [];

        if (engine.toLowerCase() === 'edge') {
            options = edge.getVoices().map(v => ({
                label: v.label,
                value: v.value,
                description: 'Edge Neural Voice'
            }));
        } else if (engine.toLowerCase() === 'azure') {
            options = azure.getVoices().map(v => ({
                label: v.label,
                value: v.value,
                description: 'Azure Neural Voice'
            }));
        } else {
            // gTTS Defaults
            options = [
                { label: 'English (US)', value: 'en-US', description: 'American Accent' },
                { label: 'English (UK)', value: 'en-GB', description: 'British Accent' },
                { label: 'English (Australia)', value: 'en-AU', description: 'Australian Accent' },
                { label: 'English (India)', value: 'en-IN', description: 'Indian Accent' },
                { label: 'French', value: 'fr-FR', description: 'French Accent' },
                { label: 'German', value: 'de-DE', description: 'German Accent' },
                { label: 'Spanish', value: 'es-ES', description: 'Spanish Accent' },
                { label: 'Italian', value: 'it-IT', description: 'Italian Accent' },
                { label: 'Japanese', value: 'ja-JP', description: 'Japanese Accent' },
                { label: 'Korean', value: 'ko-KR', description: 'Korean Accent' },
                { label: 'Portuguese (Brazil)', value: 'pt-BR', description: 'Brazilian Accent' },
                { label: 'Russian', value: 'ru-RU', description: 'Russian Accent' },
            ];
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('select_global_voice') // Distinct ID to handle in index.js
            .setPlaceholder(`Select Global Default for ${engine.toUpperCase()}`)
            .addOptions(options);

        const row = new ActionRowBuilder()
            .addComponents(select);

        await interaction.reply({
            content: `**Admin Setting**: Choose the default voice used when users haven't picked one.`,
            components: [row],
            ephemeral: true
        });
    },
};
