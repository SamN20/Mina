const { SlashCommandBuilder } = require('discord.js');
const notesStore = require('../src/features/notes/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delnote')
        .setDescription('Delete a note by ID')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the note to delete')
                .setRequired(true)),
    async execute(interaction) {
        const id = interaction.options.getString('id');
        const success = notesStore.deleteNote(interaction.user.id, id);

        if (success) {
            await interaction.reply({ content: `Note ${id} deleted.`, ephemeral: true });
        } else {
            await interaction.reply({ content: `Note ${id} not found.`, ephemeral: true });
        }
    },
};
