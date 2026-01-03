const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const registry = require('../src/core/commands/registry');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage_commands')
        .setDescription('Enable or disable voice commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to manage')
                .setRequired(true)
                .setAutocomplete(true))
        .addBooleanOption(option =>
            option.setName('enabled')
                .setDescription('Whether the command should be enabled')
                .setRequired(true)),
    
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commands = registry.getDisableableCommands();
        
        const filtered = commands.filter(cmd => {
            const name = cmd.title || cmd.id;
            return name.toLowerCase().includes(focusedValue);
        });

        await interaction.respond(
            filtered.slice(0, 25).map(cmd => ({ 
                name: `${cmd.title || cmd.id} (${registry.isCommandDisabled(cmd.id) ? 'Disabled' : 'Enabled'})`, 
                value: cmd.id 
            }))
        );
    },

    async execute(interaction) {
        const commandId = interaction.options.getString('command');
        const enabled = interaction.options.getBoolean('enabled');

        const success = registry.setCommandState(commandId, enabled);

        if (success) {
            await interaction.reply({ 
                content: `Command \`${commandId}\` has been ${enabled ? 'enabled' : 'disabled'}.`,
                ephemeral: true 
            });
        } else {
            await interaction.reply({ 
                content: `Failed to update command \`${commandId}\`. It might not exist or cannot be disabled.`,
                ephemeral: true 
            });
        }
    }
};
