require('dotenv').config();
const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started clearing application (/) commands.');

        const clientId = process.env.CLIENT_ID;
        const guildId = process.env.GUILD_ID;

        if (!clientId) {
            console.error('Error: CLIENT_ID is missing in .env');
            process.exit(1);
        }

        // 1. Clear Guild Commands (if GUILD_ID is present)
        if (guildId) {
            console.log(`Clearing guild commands for ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            console.log('Successfully cleared guild commands.');
        }

        // 2. Clear Global Commands
        console.log('Clearing global commands...');
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log('Successfully cleared global commands.');

        console.log('Done! All commands cleared.');
    } catch (error) {
        console.error('Error clearing commands:', error);
    }
})();
