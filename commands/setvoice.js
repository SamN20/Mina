const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const storage = require('../storage');
const edge = require('../tts/engines/edge');
const azure = require('../tts/engines/azure');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setvoice')
        .setDescription('Choose your preferred TTS voice/accent'),
    async execute(interaction) {
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
            .setCustomId('select_voice')
            .setPlaceholder(`Select a voice for ${engine.toUpperCase()}`)
            .addOptions(options);

        const row = new ActionRowBuilder()
            .addComponents(select);

        await interaction.reply({
            content: 'Please choose your preferred TTS voice:',
            components: [row],
            ephemeral: true
        });
    },
};
