const fs = require('fs');
const path = require('path');
const storage = require('../../core/storage');
const wrapped = require('../wrapped/store');

const GAMES_FILE = path.join(process.cwd(), 'data', 'games.json');

let gamesData = {};

// Load data
try {
    if (fs.existsSync(GAMES_FILE)) {
        gamesData = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
    }
} catch (e) {
    console.error('[Gaming] Failed to load games data:', e);
}

function saveData() {
    try {
        fs.writeFileSync(GAMES_FILE, JSON.stringify(gamesData, null, 2));
    } catch (e) {
        console.error('[Gaming] Failed to save games data:', e);
    }
}

/**
 * Record a user playing a game
 * @param {string} userId 
 * @param {string} username 
 * @param {string} gameName 
 */
function recordGameActivity(userId, username, gameName) {
    if (!gamesData[userId]) {
        gamesData[userId] = {
            username: username,
            games: {},
            lastPlayed: null
        };
    }

    // Update username if changed
    gamesData[userId].username = username;

    if (!gamesData[userId].games[gameName]) {
        gamesData[userId].games[gameName] = {
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            timesSeen: 0
        };
    }

    const gameStats = gamesData[userId].games[gameName];
    gameStats.lastSeen = Date.now();
    gameStats.timesSeen += 1;

    gamesData[userId].lastPlayed = {
        game: gameName,
        timestamp: Date.now()
    };

    saveData();

    // Wrapped: record game play
    if (!storage.isOptedOut(userId)) {
        try { wrapped.recordGame(userId, gameName); } catch (e) { }
    }
}

function getUserStats(userId) {
    return gamesData[userId] || null;
}

function getAllStats() {
    return gamesData;
}

/**
 * Find games common to a list of users
 * @param {string[]} userIds 
 * @returns {Array<{name: string, count: number}>}
 */
function findCommonGames(userIds) {
    const gameCounts = {}; // gameName -> { count: number, players: string[] }
    const totalUsers = userIds.length;

    for (const userId of userIds) {
        const data = gamesData[userId];
        if (!data || !data.games) continue;

        for (const gameName of Object.keys(data.games)) {
            if (!gameCounts[gameName]) {
                gameCounts[gameName] = { count: 0, players: [] };
            }
            gameCounts[gameName].count++;
            gameCounts[gameName].players.push(userId);
        }
    }

    // Filter for games that EVERYONE (or most) have played
    // Let's be lenient: at least 50% of people
    const threshold = Math.ceil(totalUsers * 0.5);
    
    const common = Object.entries(gameCounts)
        .filter(([name, data]) => data.count >= threshold)
        .sort((a, b) => b[1].count - a[1].count) // Sort by most popular
        .map(([name, data]) => ({ 
            name, 
            count: data.count,
            players: data.players
        }));

    return common;
}

module.exports = {
    recordGameActivity,
    getUserStats,
    getAllStats,
    findCommonGames
};
