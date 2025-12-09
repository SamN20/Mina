const { SlashCommandBuilder } = require('discord.js');
const voiceHandler = require('../voiceHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stoptts')
        .setDescription('Stop the current TTS message or clear the queue (Admin Only)')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('What to stop?')
                .setRequired(true)
                .addChoices(
                    { name: 'Current Message (Skip)', value: 'current' },
                    { name: 'Clear Entire Queue', value: 'clear' }
                )),
    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const action = interaction.options.getString('action');
        const guildId = interaction.guildId;
        const clearQueue = action === 'clear';

        const result = voiceHandler.stopTTS(guildId, clearQueue);

        if (result || clearQueue) {
            await interaction.reply({
                content: clearQueue ? '🛑 **TTS Queue Cleared & Stopped.**' : '⏭️ **Skipped current TTS message.**',
                ephemeral: true
            });
        } else {
            // Even if no player active, clearing queue is a valid action if logic supports it (it does above)
            // But if result false usually means no player active.
            await interaction.reply({
                content: clearQueue ? '🛑 **TTS Queue Cleared.**' : '⚠️ No TTS message is currently playing.',
                ephemeral: true
            });
        }
    },
};
