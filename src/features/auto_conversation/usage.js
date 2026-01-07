const fs = require('fs');
const path = require('path');

const USAGE_FILE = path.join(process.cwd(), 'data', 'usage.json');
const DAILY_LIMIT = 250;

function getUsageData() {
    if (!fs.existsSync(USAGE_FILE)) {
        return { date: new Date().toDateString(), count: 0 };
    }
    try {
        return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    } catch (e) {
        return { date: new Date().toDateString(), count: 0 };
    }
}

function saveUsageData(data) {
    try {
        fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Failed to save usage data:", e);
    }
}

function checkLimit() {
    const data = getUsageData();
    const today = new Date().toDateString();

    if (data.date !== today) {
        // Reset for new day
        data.date = today;
        data.count = 0;
        saveUsageData(data);
        return true;
    }

    return data.count < DAILY_LIMIT;
}

function incrementUsage() {
    const data = getUsageData();
    const today = new Date().toDateString();

    if (data.date !== today) {
        data.date = today;
        data.count = 0;
    }

    data.count++;
    saveUsageData(data);
    
    if (data.count % 10 === 0) {
       console.log(`[Usage] Text API Usage: ${data.count}/${DAILY_LIMIT}`); 
    }
}

module.exports = {
    checkLimit,
    incrementUsage,
    DAILY_LIMIT
};
