const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(process.cwd(), 'data', 'memory.json');

function wipeMemories() {
    console.log("Starting Memory Wipe (Preserving Profiles)...");

    if (!fs.existsSync(MEMORY_FILE)) {
        console.error("No memory file found.");
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        let count = 0;

        for (const userId in data) {
            const profile = data[userId];
            
            // Count memories before deleting
            const memCount = (profile.memories ? profile.memories.length : 0) + (profile.facts ? profile.facts.length : 0);
            
            if (memCount > 0) {
                console.log(`- Wiping ${memCount} memories for ${profile.displayName || userId}`);
                profile.memories = [];
                profile.facts = []; // Ensure legacy array is also gone
                count++;
            }
        }

        fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
        console.log(`\nSuccessfully wiped memories for ${count} users.`);
        console.log("User profiles (Names/Bios) have been preserved.");

    } catch (e) {
        console.error("Failed to wipe memories:", e);
    }
}

wipeMemories();
