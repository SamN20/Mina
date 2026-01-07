const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
const SOCIAL_FILE = path.join(DATA_DIR, 'social.json');

// Ensure files exist
if (!fs.existsSync(ACTIVITY_FILE)) fs.writeFileSync(ACTIVITY_FILE, '{}');
if (!fs.existsSync(SOCIAL_FILE)) fs.writeFileSync(SOCIAL_FILE, '{}');

let activityData = {};
let socialData = {};

try {
    activityData = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8'));
    socialData = JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8'));
} catch (e) {
    console.error('[Analytics] Failed to load data:', e);
}

// Migrate legacy heatmap shape -> per-year buckets if needed
function migrateLegacyData() {
    const year = new Date().getFullYear().toString();
    for (const userId of Object.keys(activityData)) {
        const entry = activityData[userId];
        // If entry has top-level heatmap (legacy), move it under years[currentYear]
        if (entry && entry.heatmap && !entry.years) {
            const heat = entry.heatmap;
            delete entry.heatmap;
            entry.years = {};
            entry.years[year] = { heatmap: heat };
        }
        // Ensure structure exists
        if (!entry.years) entry.years = {};
    }
}

migrateLegacyData();

function saveActivity() {
    try {
        fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(activityData, null, 2));
    } catch (e) { console.error(e); }
}

function saveSocial() {
    try {
        fs.writeFileSync(SOCIAL_FILE, JSON.stringify(socialData, null, 2));
    } catch (e) { console.error(e); }
}

// --- Activity Heatmap ---

function updateActivity(userId, type, amount = 1) {
    const now = new Date();
    const year = now.getFullYear().toString();
    const day = now.getDay(); // 0-6
    const hour = now.getHours(); // 0-23

    if (!activityData[userId]) activityData[userId] = { years: {} };

    // If legacy heatmap still present, migrate it into current year
    if (activityData[userId].heatmap && !activityData[userId].years) {
        const legacy = activityData[userId].heatmap;
        activityData[userId].years = {};
        activityData[userId].years[year] = { heatmap: legacy };
        delete activityData[userId].heatmap;
    }

    if (!activityData[userId].years) activityData[userId].years = {};
    if (!activityData[userId].years[year]) activityData[userId].years[year] = { heatmap: {} };

    const heatmap = activityData[userId].years[year].heatmap;
    if (!heatmap[day]) heatmap[day] = {};
    if (!heatmap[day][hour]) heatmap[day][hour] = { voice: 0, msg: 0, online: 0 };

    if (type === 'voice') heatmap[day][hour].voice += amount;
    if (type === 'msg') heatmap[day][hour].msg += amount;
    if (type === 'online') heatmap[day][hour].online += amount;

    // Removed auto-save for performance
}

// --- Social Graph ---

function updateRelationship(userA, userB, minutes = 1) {
    // Ensure structure for A
    if (!socialData[userA]) socialData[userA] = { relationships: {} };
    if (!socialData[userA].relationships[userB]) socialData[userA].relationships[userB] = { voiceTime: 0 };
    
    socialData[userA].relationships[userB].voiceTime += minutes;

    // Ensure structure for B (undirected graph, but stored directed for ease)
    if (!socialData[userB]) socialData[userB] = { relationships: {} };
    if (!socialData[userB].relationships[userA]) socialData[userB].relationships[userA] = { voiceTime: 0 };
    
    socialData[userB].relationships[userA].voiceTime += minutes;
    
    // Removed auto-save for performance
}

function saveAll() {
    saveActivity();
    saveSocial();
}

module.exports = {
    updateActivity,
    updateRelationship,
    saveAll,
    getActivity: () => activityData,
    getSocial: () => socialData
};
