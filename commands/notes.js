const { SlashCommandBuilder } = require('discord.js');
const notesStore = require('../src/features/notes/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notes')
        .setDescription('List your notes'),
    async execute(interaction) {
        const notes = notesStore.getNotes(interaction.user.id);
        if (notes.length === 0) {
            await interaction.reply({ content: "You don't have any notes.", ephemeral: true });
            return;
        }

        const list = notes.map(n => `**[ID ${n.id}]**: ${n.content}`).join('\n');
        await interaction.reply({ content: `**Your Notes:**\n${list}`, ephemeral: true });
    },
};
