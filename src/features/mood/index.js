const fs = require('fs');
const path = require('path');
const satellite = require('../../integrations/satellite');

const MOOD_FILE = path.join(process.cwd(), 'data', 'mood.json');
let tiltLevel = 0; // 0 to 100
let lastUpdate = Date.now();

// Load mood from disk
try {
    if (fs.existsSync(MOOD_FILE)) {
        const data = JSON.parse(fs.readFileSync(MOOD_FILE, 'utf8'));
        tiltLevel = data.tiltLevel || 0;
        lastUpdate = data.lastUpdate || Date.now();

        // Calculate offline decay
        const now = Date.now();
        const minutesPassed = Math.floor((now - lastUpdate) / (60 * 1000));
        if (minutesPassed > 0) {
            const decay = minutesPassed; // 1 point per minute
            const oldTilt = tiltLevel;
            tiltLevel = Math.max(0, tiltLevel - decay);
            console.log(`[Mood] Offline decay: -${decay} points (${oldTilt} -> ${tiltLevel})`);
        }
    }
} catch (e) {
    console.error('[Mood] Failed to load mood:', e);
}

function saveMood() {
    try {
        fs.writeFileSync(MOOD_FILE, JSON.stringify({
            tiltLevel,
            lastUpdate: Date.now()
        }, null, 2));
    } catch (e) {
        console.error('[Mood] Failed to save mood:', e);
    }
}

function getMood() {
    if (tiltLevel < 20) return { level: tiltLevel, description: "Happy, Helpful, Cheerful" };
    if (tiltLevel < 50) return { level: tiltLevel, description: "Normal, Casual" };
    if (tiltLevel < 80) return { level: tiltLevel, description: "Annoyed, Sarcastic, Short answers" };
    return { level: tiltLevel, description: "Angry, Tilted, Rage mode" };
}

function modifyTilt(amount) {
    const oldLevel = tiltLevel;
    tiltLevel = Math.max(0, Math.min(100, tiltLevel + amount));
    if (oldLevel !== tiltLevel) {
        console.log(`[Mood] Tilt changed: ${oldLevel} -> ${tiltLevel} (Delta: ${amount})`);
        saveMood();

        // Broadcast mood update
        const mood = getMood();
        satellite.broadcast('mood_update', {
            level: tiltLevel,
            description: mood.description,
            delta: amount
        });
    }
}

function updateMood(text) {
    // Deprecated: Logic moved to AI, but keeping for manual triggers if needed
    // For now, we can leave it empty or just support the "Rage Quit" hard override
    if (text === 'bad bot bad bot bad bot') {
        modifyTilt(100);
    }
}

// Decay tilt every minute (cool off)
setInterval(() => {
    if (tiltLevel > 0) {
        tiltLevel = Math.max(0, tiltLevel - 5);
        console.log(`[Mood] Cooling down... Current tilt: ${tiltLevel}%`);
        saveMood();
    }
}, 60 * 1000);

module.exports = {
    getMood,
    updateMood,
    modifyTilt
};
