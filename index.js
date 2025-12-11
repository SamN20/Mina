require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const http = require('http'); // For Socket.io
const satelliteServer = require('./satelliteServer');
const voiceHandler = require('./voiceHandler');
const storage = require('./storage');
const reminders = require('./reminders');

// Satellite Server Setup
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Mina Satellite Uplink Online');
});
server.listen(3001, () => {
    console.log('[Satellite] Server listening on port 3001');
});
satelliteServer.init(server);

// Check env
if (!process.env.DISCORD_TOKEN) {
    console.error('Error: DISCORD_TOKEN is missing in .env');
    process.exit(1);
}

// 1. Setup Model (Async check, we assume it's there or user ran setup)
const transcription = require('./transcription');
try {
    transcription.initModel();
} catch (e) {
    console.error("Vosk model failed to load. Please run 'node setup-model.js' first.");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    c.user.setActivity('Listening for /join', { type: ActivityType.Listening });

    // Load and schedule existing reminders
    const activeReminders = reminders.getActiveReminders();
    console.log(`[Reminders] Loading ${activeReminders.length} active reminders`);

    for (const reminder of activeReminders) {
        // Find which guild the user is in (we need to check all guilds)
        for (const guild of c.guilds.cache.values()) {
            try {
                const member = guild.members.cache.get(reminder.userId);
                if (member) {
                    // Schedule the reminder for this guild
                    voiceHandler.scheduleReminder(c, guild.id, reminder.userId, reminder);
                    break; // Found the guild, no need to check others
                }
            } catch (e) {
                // User might not be in this guild or other error
                continue;
            }
        }
    }

    // Clean up old reminders periodically
    setInterval(() => {
        reminders.cleanupOldReminders();
    }, 60 * 60 * 1000); // Clean up every hour
});

client.on(Events.InteractionCreate, async interaction => {
    console.log(`[Interaction] Received: ${interaction.type} - Command: ${interaction.commandName} - ID: ${interaction.customId}`);

    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            // Special handling for join/leave to use our voiceHandler
            if (interaction.commandName === 'join') {
                await voiceHandler.joinChannel(interaction);
            } else if (interaction.commandName === 'leave') {
                const left = await voiceHandler.leaveChannel(interaction.guildId);
                if (left) await interaction.reply({ content: 'Left the voice channel.', ephemeral: false });
                else await interaction.reply({ content: 'I am not in a voice channel.', ephemeral: true });
            } else if (interaction.commandName === 'download') {
                // Handle download
                const userId = interaction.user.id;
                const filePath = storage.getTranscriptPath(userId);

                if (filePath && fs.existsSync(filePath)) {
                    await interaction.reply({
                        content: 'Here is your latest transcript:',
                        files: [filePath],
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({ content: `No transcript found for today.`, ephemeral: true });
                }
            } else {
                await command.execute(interaction);
            }
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    }
    // Handle Autocomplete
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
    }
    // Handle Buttons
    else if (interaction.isButton()) {
        if (interaction.customId === 'leave_voice') {
            try {
                await interaction.deferReply(); // Acknowledge immediately to prevent "Interaction failed"

                const left = await voiceHandler.leaveChannel(interaction.guildId);

                if (left) {
                    await interaction.editReply({ content: 'Stopped recording and left channel.' });
                } else {
                    await interaction.editReply({ content: 'I am not currently in a voice channel.' });
                }
            } catch (error) {
                console.error('Error handling button:', error);
                if (interaction.deferred) {
                    await interaction.editReply({ content: 'Error processing request.' });
                } else {
                    await interaction.reply({ content: 'Error processing request.', ephemeral: true });
                }
            }
        }
        else if (interaction.customId === 'toggle_chatter') {
            const { getChatterEnabled, setChatterEnabled } = storage;
            const newState = !getChatterEnabled();
            setChatterEnabled(newState);

            await interaction.reply({
                content: `🦜 **Chatterbox Mode is now ${newState ? 'ON' : 'OFF'}**`,
                ephemeral: true
            });
        }
    }
    // Handle Select Menus
    else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_voice') {
            const selectedVoice = interaction.values[0];
            const userId = interaction.user.id;

            const { setVoice } = storage;
            setVoice(userId, selectedVoice);

            await interaction.reply({ content: `✅ Voice set to: ${selectedVoice}`, ephemeral: true });
        } else if (interaction.customId === 'select_global_voice') {
            const selectedVoice = interaction.values[0];
            // Admin Check
            const adminIds = (process.env.ADMIN_IDS || '').split(',');
            if (!adminIds.includes(interaction.user.id)) {
                return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
            }

            const { setGlobalVoice } = storage;
            setGlobalVoice(selectedVoice);
            await interaction.reply({ content: `✅ Global System Voice set to: ${selectedVoice}`, ephemeral: true });
        }
    }
});

// Event: Voice State Update (Join/Leave Logging & Theme Songs)
// Event: Voice State Update (Join/Leave Logging & Theme Songs)
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId = newState.member.id;
    const guildId = newState.guild.id;
    const botChannelId = voiceHandler.getBotChannelId(guildId);

    // Ignore updates that are not channel changes (e.g. mute/deaf/stream)
    if (oldState.channelId === newState.channelId) return;

    // User Joined Bot's Channel
    if (newState.channelId && newState.channelId === botChannelId) {

        // Log Event
        const member = newState.member;
        const username = member ? member.displayName : userId;
        const logText = `${username} joined the channel.`;
        storage.logEvent(username, userId, logText);
        console.log(`[Event] ${username} joined.`);


        if (newState.member.user.bot) {
            console.log(`[Event] ${username} is a bot, skipping.`);
            return;
        }

        // Play Join Sound (Theme Song)
        const joinSound = storage.getJoinSound(userId);
        if (joinSound) {
            console.log(`[Theme] Playing join sound for ${username}`);
            // Small delay to ensure connection is stable and user can hear it
            setTimeout(() => {
                voiceHandler.playFile(guildId, joinSound, 5000, 0.5); // Max 5000ms, 0.5 Volume
            }, 2000);
        }

        // Small delay to let join sound play before greeting user
        setTimeout(() => {
            voiceHandler.greetNewUser(newState.guild.id, userId, newState.member);
        }, 5000);
    }
    // User Left Bot's Channel
    else if (oldState.channelId && oldState.channelId === botChannelId) {
        const member = oldState.member;
        const username = member ? member.displayName : userId;
        const logText = `${username} left the channel.`;
        storage.logEvent(username, userId, logText);
        console.log(`[Event] ${username} left.`);

        // Play Leave Sound
        const leaveSound = storage.getLeaveSound(userId);
        if (leaveSound) {
            console.log(`[Theme] Playing leave sound for ${username}`);
            // Play sound (max 5s, 50% volume)
            // Wait small delay to ensure Discord registers the leave visually? Not strictly necessary but safe.
            voiceHandler.playFile(guildId, leaveSound, 5000, 0.5);
        }

        // Reset Status if BOT left
        if (userId === client.user.id) {
            console.log("[Status] Bot left voice. Resetting status.");
            client.user.setActivity('Listening for /join', { type: ActivityType.Listening });
        }
    }

    // Ghost Mode Logic (Bot NOT in channel)
    // Only if botChannelId is null (bot not connected to this guild)
    else if (!botChannelId && storage.getGhostMode()) {
        console.log(`[Ghost] Checking ghost action for ${userId}`);
        const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus } = require('@discordjs/voice');

        // Helper to quick join-play-leave
        const playGhostSound = async (channel, soundPath) => {
            if (!soundPath || !fs.existsSync(soundPath)) return;

            console.log(`[Ghost] Joining ${channel.name} to play sound...`);
            try {
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false,
                    daveEncryption: false
                });

                connection.once(VoiceConnectionStatus.Ready, () => {
                    const player = createAudioPlayer();
                    const resource = createAudioResource(soundPath, { inlineVolume: true });
                    resource.volume.setVolume(0.5);
                    player.play(resource);
                    connection.subscribe(player);

                    // Disconnect after playback (+ buffer)
                    setTimeout(() => {
                        try { connection.destroy(); } catch (e) { }
                    }, 5500);
                });
            } catch (e) {
                console.error("Ghost Mode Error:", e);
            }
        };

        // Ghost JOIN
        if (newState.channelId) {
            const joinSound = storage.getJoinSound(userId);
            if (joinSound) {
                const channel = newState.channel;
                if (channel) playGhostSound(channel, joinSound);
            }
        }
        // Ghost LEAVE
        else if (oldState.channelId) {
            const leaveSound = storage.getLeaveSound(userId);
            if (leaveSound) {
                const channel = oldState.channel;
                if (channel) playGhostSound(channel, leaveSound);
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
