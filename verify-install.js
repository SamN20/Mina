try {
    const vosk = require('vosk');
    console.log('Vosk loaded successfully.');
} catch (e) {
    console.error('Failed to load vosk:', e);
}

try {
    const discord = require('discord.js');
    console.log('Discord.js loaded successfully.');
} catch (e) {
    console.error('Failed to load discord.js:', e);
}

try {
    const voice = require('@discordjs/voice');
    console.log('@discordjs/voice loaded successfully.');
} catch (e) {
    console.error('Failed to load @discordjs/voice:', e);
}
