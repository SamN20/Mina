const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const reminders = require('../reminders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminders')
        .setDescription('Manage your voice reminders')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List your active reminders')
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Cancel a reminder')
                .addStringOption(opt => opt.setName('id').setDescription('Reminder ID to cancel').setRequired(true))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (sub === 'list') {
            const userReminders = reminders.getUserReminders(userId);

            if (userReminders.length === 0) {
                await interaction.reply({ content: 'You have no active reminders.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('Your Active Reminders')
                .setColor(0x0099FF);

            for (const reminder of userReminders) {
                const remindTime = new Date(reminder.remindAt);
                const timeUntil = Math.max(0, Math.round((remindTime - new Date()) / 1000 / 60));

                embed.addFields({
                    name: `ID: ${reminder.id}`,
                    value: `"${reminder.message}"\nIn ${timeUntil} minutes (${remindTime.toLocaleString()})`,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (sub === 'cancel') {
            const reminderId = interaction.options.getString('id');

            const removed = reminders.removeReminder(reminderId);
            if (removed) {
                await interaction.reply({ content: 'Reminder cancelled successfully.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Reminder not found or already triggered.', ephemeral: true });
            }
        }
    }
};