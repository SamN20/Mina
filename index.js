require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, Events, GatewayIntentBits, ActivityType, ChannelType, Partials } = require('discord.js');
const http = require('http'); // For Socket.io
const satelliteServer = require('./src/integrations/satellite');
const voiceHandler = require('./src/core/voice/handler');
const audio = require('./src/integrations/discord/audio');
const storage = require('./src/core/storage');
const reminders = require('./src/features/reminders/store');
const scheduler = require('./src/features/reminders/scheduler');
const intentClassifier = require('./src/core/nlu/classifier');
const autoConversation = require('./src/features/auto_conversation');
const gaming = require('./src/features/gaming');
const reactions = require('./src/features/reactions');
const analytics = require('./src/features/analytics');
const greetings = require('./src/features/greetings'); // Fixed: Added missing import
require('./src/features'); // Load all features (Commands)

// Satellite Server Setup
const server = http.createServer((req, res) => {
    // Global CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API: List animations
    if (req.url.startsWith('/api/animations')) {
        const animDir = path.join(__dirname, 'assets', 'animations');
        fs.readdir(animDir, (err, files) => {
            if (err) {
                // If directory doesn't exist, return empty list
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }
            // Filter for supported formats
            const anims = files.filter(f => f.endsWith('.fbx') || f.endsWith('.vrma'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(anims));
        });
        return;
    }

    // Serve Static Assets (e.g. VRM models)
    if (req.url.startsWith('/assets/')) {
        // Basic path sanitization
        const decodedUrl = decodeURIComponent(req.url);
        const safePath = path.normalize(decodedUrl).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(__dirname, safePath);

        // Ensure we are still in the assets folder
        if (!filePath.startsWith(path.join(__dirname, 'assets'))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }

            if (filePath.endsWith('.vrm')) {
                res.setHeader('Content-Type', 'model/gltf-binary');
            } else if (filePath.endsWith('.fbx')) {
                res.setHeader('Content-Type', 'application/octet-stream');
            } else if (filePath.endsWith('.vrma')) {
                res.setHeader('Content-Type', 'model/gltf-binary');
            }

            res.writeHead(200);
            res.end(data);
        });
        return;
    }

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
const transcription = require('./src/integrations/transcription');
try {
    transcription.initModel();
} catch (e) {
    console.error("Vosk model failed to load. Please run 'node setup-model.js' first.");
    process.exit(1);
}

const wrapped = require('./src/features/wrapped/store');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Channel] // Required for DMs
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
                    scheduler.scheduleReminder(c, guild.id, reminder.userId, reminder);
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

    // Initialize Analytics
    analytics.init(client);
});

client.on(Events.InteractionCreate, async interaction => {
    console.log(`[Interaction] Received: ${interaction.type} - Command: ${interaction.commandName} - ID: ${interaction.customId}`);

    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            // Wrapped: record command usage (user + server)
            try { wrapped.incrCommand(interaction.user.id, interaction.guildId, interaction.commandName, 1); } catch (e) { }
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

        // Wrapped: start voice session
        try { wrapped.startVoiceSession(userId, guildId, newState.channelId); } catch (e) { }


        if (newState.member.user.bot) {
            console.log(`[Event] ${username} is a bot, skipping.`);
            return;
        }

        // Play Join Sound (Theme Song or Generic)
        const joinSound = storage.getJoinSound(userId);
        const genericJoin = path.join(process.cwd(), 'data', 'sounds', 'join.mp3');

        // Async Sequence for Join Events
        (async () => {
            // 1. Wait for connection stability
            await new Promise(r => setTimeout(r, 1500));

            // 2. Play Join Sound (Queued)
            if (joinSound) {
                console.log(`[Theme] Playing join sound for ${username}`);
                voiceHandler.playFile(guildId, joinSound, 5000, 0.5, true);
            } else if (fs.existsSync(genericJoin)) {
                voiceHandler.playFile(guildId, genericJoin, 0, 0.5, true);
            }

            // 3. Greet User (Queued)
            // Wait a tiny bit to ensure the file play command hit the queue first
            await new Promise(r => setTimeout(r, 500));
            await voiceHandler.greetNewUser(newState.guild.id, userId, newState.member);

            // 4. Play Reminders (Queued)
            const pendingReminders = reminders.getAndRemoveTriggeredReminders(userId, 'on_join', newState.guild.id);
            if (pendingReminders.length > 0) {
                console.log(`[Reminders] Found ${pendingReminders.length} on-join reminders for ${username}`);
                for (const r of pendingReminders) {
                    // Speak adds to queue automatically
                    voiceHandler.speak(guildId, `By the way, you asked me to remind you: ${r.message}`);
                }
            }
        })();
    }
    // User Left Bot's Channel
    else if (oldState.channelId && oldState.channelId === botChannelId) {
        const member = oldState.member;
        const username = member ? member.displayName : userId;
        const logText = `${username} left the channel.`;
        storage.logEvent(username, userId, logText);
        console.log(`[Event] ${username} left.`);

        // Wrapped: end voice session and record duration
        try { wrapped.endVoiceSession(userId); } catch (e) { }

        // Play Leave Sound
        const leaveSound = storage.getLeaveSound(userId);
        const genericLeave = path.join(process.cwd(), 'data', 'sounds', 'leave.mp3');

        if (leaveSound) {
            console.log(`[Theme] Playing leave sound for ${username}`);
            // Play sound (max 5s, 50% volume)
            voiceHandler.playFile(guildId, leaveSound, 5000, 0.5, true);
        } else if (fs.existsSync(genericLeave)) {
            voiceHandler.playFile(guildId, genericLeave, 0, 0.5, true);
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
        const { entersState, VoiceConnectionStatus } = require('@discordjs/voice');

        // Helper for Ghost Actions
        const performGhostAction = async (channel, actions) => {
            console.log(`[Ghost] Joining ${channel.name}...`);
            try {
                // Join using main audio system
                const connection = audio.join(channel);

                // Wait for Ready
                await entersState(connection, VoiceConnectionStatus.Ready, 5000);

                // Execute Actions sequentially
                for (const action of actions) {
                    if (action.type === 'file') {
                        // Use queue=true to get the Promise
                        await voiceHandler.playFile(guildId, action.path, 5000, 0.5, true);
                    } else if (action.type === 'speak') {
                        await voiceHandler.speak(guildId, action.text);
                    }
                }

                // Leave
                await new Promise(r => setTimeout(r, 500)); // Small buffer
                audio.leave(guildId);

            } catch (e) {
                console.error("[Ghost] Error:", e);
                audio.leave(guildId);
            }
        };

        // Ghost JOIN
        if (newState.channelId) {
            const actions = [];
            // Play join sound if any
            const joinSound = storage.getJoinSound(userId);
            if (joinSound) {
                actions.push({ type: 'file', path: joinSound });
            }
            // // Greet NOTE: Bot should not greet in ghost mode to avoid confusion
            // const member = newState.member;
            // if (member) {
            //     const greeting = greetings.generateGreeting(member, newState.channel);
            //     if (greeting) {
            //         actions.push({ type: 'speak', text: greeting });
            //     }
            // }
            // Reminders
            const pendingReminders = reminders.getAndRemoveTriggeredReminders(userId, 'on_join', newState.guild.id);
            if (pendingReminders.length > 0) {
                for (const r of pendingReminders) {
                    actions.push({ type: 'speak', text: `By the way, you asked me to remind you: ${r.message}` });
                }
            }

            if (actions.length > 0) {
                performGhostAction(newState.channel, actions);
            }
        }
        // Ghost LEAVE
        else if (oldState.channelId) {
            const leaveSound = storage.getLeaveSound(userId);
            if (leaveSound) {
                performGhostAction(oldState.channel, [{ type: 'file', path: leaveSound }]);
            }
        }
    }
});

// Event: Voice State Update (Join/Leave Logging & Theme Songs)

// Event: Message Reaction Add (Track reactions)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
        if (user.bot) return;
        if (storage.isOptedOut(user.id)) return;
        wrapped.incrReaction(user.id, reaction.message.guildId, 1);
    } catch (e) {
        console.error('[Wrapped] Error tracking reaction:', e);
    }
});

// Event: Message Create (DM Handling & Auto-Conversation)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // Debug log to verify we are receiving messages
    if (storage.getDebugMode()) {
        console.log(`[Message] Received in ${message.channel.type === ChannelType.DM ? 'DM' : 'Guild'}: "${message.content}"`);
    }

    // 1. Auto-Conversation (Text Channels)
    if (message.channel.type === ChannelType.GuildText) {
        // Track Analytics
        analytics.trackMessage(message);

        // Handle Reactions
        reactions.handleMessage(message);

        // Check for Mentions or Replies
        const isMentioned = message.mentions.users.has(client.user.id);
        
        let isReply = false;
        let replyContext = null;

        if (message.reference) {
            try {
                const refMsg = await message.fetchReference();
                isReply = (refMsg.author.id === client.user.id);
                replyContext = {
                    username: refMsg.member?.displayName || refMsg.author.username,
                    content: refMsg.content
                };
            } catch (e) {
                // message might be deleted or inaccessible
            }
        }

        const isDirect = isMentioned || isReply;

        // Only if message is long enough to be meaningful (lowered to 2 for testing) OR if directly addressed
        if (message.content.length > 1 || isDirect) {
            autoConversation.processUtterance(message.content, {
                guildId: message.guild.id,
                channelId: message.channel.id,
                username: message.member?.displayName || message.author.username,
                type: 'text',
                channel: message.channel,
                isDirect: isDirect, // FEATURE: Direct Mention Handling
                userId: message.author.id,
                replyContext: replyContext // FEATURE: Reply Context
            });
        }
        return;
    }

    if (message.channel.type !== ChannelType.DM) return;

    console.log(`[DM] Received from ${message.author.tag}: ${message.content}`);

    const text = message.content;
    const userId = message.author.id;

    // 1. Check for "On Join" Reminder
    // Pattern: "remind me next time I join (to|that) X"
    if (/remind me (next time|when) I join/i.test(text)) {
        const match = text.match(/remind me (?:next time|when) I join (?:to |that )?(.*)/i);
        if (match) {
            const reminderText = match[1];
            reminders.addReminder(userId, reminderText, null, 'on_join', message.guild.id);
            return message.reply(`Okay, I'll remind you "${reminderText}" the next time you join a voice channel I'm in.`);
        }
    }

    // 2. Check for Time-based Reminder
    const reminderData = intentClassifier.parseReminder(text);
    if (reminderData) {
        const reminder = reminders.addReminder(userId, reminderData.message, reminderData.remindAt, 'time', message.guild.id);

        // Schedule it immediately if possible (though scheduler usually needs a guild context)
        // The scheduler.scheduleReminder function takes (client, guildId, userId, reminder)
        // Since this is a DM, we don't have a guildId.
        // However, the scheduler iterates over guilds to find the user when the timer fires.
        // But we need to register the timeout in memory.

        // We can try to find a mutual guild to schedule it on?
        // Or update scheduler to handle DM-set reminders?
        // The current scheduler.scheduleReminder implementation:
        /*
        function scheduleReminder(client, guildId, userId, reminder) {
            ...
            const job = setTimeout(() => {
                // Execute reminder (speak in voice)
                const conn = audio.getConnection(guildId);
                if (conn) ...
            }, delay);
        }
        */

        // If we don't pass a guildId, the scheduler won't know where to speak.
        // But we can iterate all guilds the bot is in, find where the user is connected?
        // For now, let's just save it. The `index.js` startup loop schedules active reminders.
        // But we need to schedule it dynamically for *now*.

        // Let's try to find a guild the user is currently in voice for?
        let scheduled = false;
        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(userId);
            if (member && member.voice.channel) {
                scheduler.scheduleReminder(client, guild.id, userId, reminder);
                scheduled = true;
                break; // Only schedule on one active connection
            }
        }

        // If not in voice, we can't schedule the *voice* reminder yet.
        // But if they join later, the startup loop won't catch it unless we restart.
        // We need a global reminder watcher? 
        // Or just accept that if they aren't in voice NOW, they might miss it?
        // Actually, `scheduler.scheduleReminder` sets a timeout. When timeout fires, it checks connection.
        // So we should schedule it for *all* mutual guilds? Or just one?
        // If we schedule for all, we might get duplicate reminders if they are in multiple (rare).

        if (!scheduled) {
            // Just pick the first mutual guild to register the timer
            for (const guild of client.guilds.cache.values()) {
                if (guild.members.cache.has(userId)) {
                    scheduler.scheduleReminder(client, guild.id, userId, reminder);
                    break;
                }
            }
        }

        return message.reply(`Okay, I've set a reminder for "${reminderData.message}" at ${new Date(reminderData.remindAt).toLocaleTimeString()}.`);
    }

    // 3. Default Chat
    // Maybe just acknowledge?
    // message.reply("I only understand reminders right now in DMs.");
});

client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    gaming.handlePresenceUpdate(oldPresence, newPresence);
});

client.login(process.env.DISCORD_TOKEN);
