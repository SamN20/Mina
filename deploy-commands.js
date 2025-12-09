const { REST, Routes } = require('discord.js');
require('dotenv').config();
// const { clientId, guildId, token } = require('./config.json'); 


const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        const CLIENT_ID = process.env.CLIENT_ID;
        let GUILD_ID = process.env.GUILD_ID;

        // Validation
        if (!CLIENT_ID) throw new Error("CLIENT_ID is missing in .env");
        if (!/^\d+$/.test(CLIENT_ID)) {
            console.error(`[ERROR] CLIENT_ID "${CLIENT_ID}" is not a valid snowflake (should be numbers only). You might have used the Client Secret or Token?`);
            process.exit(1);
        }
        if (GUILD_ID && !/^\d+$/.test(GUILD_ID)) {
            console.log(`[WARNING] GUILD_ID "${GUILD_ID}" is not a valid snowflake. defaulting to global deploy.`);
            GUILD_ID = null;
        }

        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // If GUILD_ID is present, deploy to guild (faster update). Else global.
        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands },
            );
            console.log(`Successfully reloaded application (/) commands for Guild ${GUILD_ID}.`);
        } else {
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands },
            );
            console.log('Successfully reloaded application (/) commands globally.');
        }

    } catch (error) {
        console.error('API Error:', error);
        if (error.rawError) console.error(JSON.stringify(error.rawError, null, 2));
    }
})();
