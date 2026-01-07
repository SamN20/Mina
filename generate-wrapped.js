const wrapped = require('./src/features/wrapped/store');
const fs = require('fs');
const path = require('path');

function calculateStreaks(year) {
    const transcriptsDir = path.join(process.cwd(), 'data', 'transcripts');
    const streaks = {};

    if (!fs.existsSync(transcriptsDir)) return streaks;

    const dates = fs.readdirSync(transcriptsDir).filter(d => d.startsWith(year)).sort();

    for (const date of dates) {
        const dayDir = path.join(transcriptsDir, date);
        if (!fs.statSync(dayDir).isDirectory()) continue;

        const files = fs.readdirSync(dayDir);
        const activeUsers = new Set();

        for (const file of files) {
            const match = file.match(/-(\d+)\.txt$/);
            if (match) {
                activeUsers.add(match[1]);
            }
        }

        for (const userId of activeUsers) {
            if (!streaks[userId]) streaks[userId] = [];
            streaks[userId].push(date);
        }
    }

    // Calculate longest streak for each user
    const userStreaks = {};
    for (const [userId, dates] of Object.entries(streaks)) {
        if (dates.length === 0) continue;
        dates.sort();
        let maxStreak = 1;
        let currentStreak = 1;
        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i-1]);
            const curr = new Date(dates[i]);
            const diff = (curr - prev) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }
        userStreaks[userId] = maxStreak;
    }

    return userStreaks;
}

function generateWrappedReport(year = null) {
    const data = wrapped.loadYear(year);
    const streaks = calculateStreaks(year || new Date().getFullYear().toString());
    const report = { users: {}, servers: {} };

    // Process users
    for (const [userId, stats] of Object.entries(data.users)) {
        report.users[userId] = {
            messages: stats.messages,
            voiceMinutes: stats.voiceMinutes,
            tts: stats.tts,
            reactions: stats.reactions,
            aiInteractions: stats.aiInteractions,
            remindersSet: stats.remindersSet,
            remindersCompleted: stats.remindersCompleted,
            topWords: Object.entries(stats.topWords || {}).sort((a,b) => b[1] - a[1]).slice(0, 10),
            topChannels: Object.entries(stats.channels || {}).sort((a,b) => (b[1].messages || 0) - (a[1].messages || 0)).slice(0, 5),
            gamesPlayed: Object.keys(stats.games || {}).length,
            moodChanges: Object.keys(stats.moods || {}).length,
            longestStreak: streaks[userId] || 0,
            hourlyActivity: stats.hourlyActivity || {}
        };
    }

    // Process servers
    for (const [guildId, stats] of Object.entries(data.servers)) {
        report.servers[guildId] = {
            messages: stats.messages,
            voiceMinutes: stats.voiceMinutes,
            tts: stats.tts,
            reactions: stats.reactions,
            aiInteractions: stats.aiInteractions,
            remindersSet: stats.remindersSet,
            remindersCompleted: stats.remindersCompleted,
            topWords: Object.entries(stats.topWords || {}).sort((a,b) => b[1] - a[1]).slice(0, 10),
            topChannels: Object.entries(stats.channels || {}).sort((a,b) => (b[1].messages || 0) - (a[1].messages || 0)).slice(0, 5),
            gamesPlayed: Object.keys(stats.games || {}).length,
            moodChanges: Object.keys(stats.moods || {}).length,
            hourlyActivity: stats.hourlyActivity || {}
        };
    }

    return report;
}

// If run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const year = args.find(arg => !arg.startsWith('--')) || new Date().getFullYear().toString();
    const excel = args.includes('--excel');
    const report = generateWrappedReport(year);

    if (excel) {
        exportToExcel(report, year);
    } else {
        console.log(JSON.stringify(report, null, 2));
    }
}

function exportToExcel(report, year) {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    // Users sheet
    const userData = [['User ID', 'Messages', 'Voice Minutes', 'TTS', 'Reactions', 'AI Interactions', 'Reminders Set', 'Reminders Completed', 'Games Played', 'Mood Changes', 'Longest Streak', 'Top Words', 'Top Channels', 'Hourly Activity']];
    for (const [userId, stats] of Object.entries(report.users)) {
        userData.push([
            userId,
            stats.messages,
            stats.voiceMinutes,
            stats.tts,
            stats.reactions,
            stats.aiInteractions,
            stats.remindersSet,
            stats.remindersCompleted,
            stats.gamesPlayed,
            stats.moodChanges,
            stats.longestStreak,
            stats.topWords.map(([w,c]) => `${w}:${c}`).join(', '),
            stats.topChannels.map(([c,d]) => `${c}:${d.messages}`).join(', '),
            Object.entries(stats.hourlyActivity).map(([h,c]) => `${h}:${c}`).join(', ')
        ]);
    }
    const userSheet = XLSX.utils.aoa_to_sheet(userData);
    XLSX.utils.book_append_sheet(wb, userSheet, 'Users');

    // Servers sheet
    const serverData = [['Server ID', 'Messages', 'Voice Minutes', 'TTS', 'Reactions', 'AI Interactions', 'Reminders Set', 'Reminders Completed', 'Games Played', 'Mood Changes', 'Top Words', 'Top Channels', 'Hourly Activity']];
    for (const [guildId, stats] of Object.entries(report.servers)) {
        serverData.push([
            guildId,
            stats.messages,
            stats.voiceMinutes,
            stats.tts,
            stats.reactions,
            stats.aiInteractions,
            stats.remindersSet,
            stats.remindersCompleted,
            stats.gamesPlayed,
            stats.moodChanges,
            stats.topWords.map(([w,c]) => `${w}:${c}`).join(', '),
            stats.topChannels.map(([c,d]) => `${c}:${d.messages}`).join(', '),
            Object.entries(stats.hourlyActivity).map(([h,c]) => `${h}:${c}`).join(', ')
        ]);
    }
    const serverSheet = XLSX.utils.aoa_to_sheet(serverData);
    XLSX.utils.book_append_sheet(wb, serverSheet, 'Servers');

    XLSX.writeFile(wb, `wrapped-${year}.xlsx`);
    console.log(`Exported to wrapped-${year}.xlsx`);
}

module.exports = { generateWrappedReport };