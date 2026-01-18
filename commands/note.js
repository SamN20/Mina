const { SlashCommandBuilder } = require('discord.js');
const notesStore = require('../src/features/notes/store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('note')
        .setDescription('Create a new note')
        .addStringOption(option =>
            option.setName('content')
                .setDescription('The content of the note')
                .setRequired(true)),
    async execute(interaction) {
        const content = interaction.options.getString('content');
        const note = notesStore.addNote(interaction.user.id, content);
        await interaction.reply({ content: `Note saved. ID: ${note.id}`, ephemeral: true });
    },
};
