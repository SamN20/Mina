const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DND_FILE = path.join(DATA_DIR, 'dnd_state.json');

class DNDStore {
    constructor() {
        this.activeDNDs = new Map(); // channelId -> userId
        this.load();
    }

    load() {
        if (fs.existsSync(DND_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(DND_FILE, 'utf8'));
                for (const [channelId, userId] of Object.entries(data)) {
                    this.activeDNDs.set(channelId, userId);
                }
            } catch (e) {
                console.error("Failed to load DND state:", e);
            }
        }
    }

    save() {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            const data = Object.fromEntries(this.activeDNDs);
            fs.writeFileSync(DND_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error("Failed to save DND state:", e);
        }
    }

    setDND(channelId, userId) {
        this.activeDNDs.set(channelId, userId);
        this.save();
    }

    removeDND(channelId) {
        if (this.activeDNDs.has(channelId)) {
            this.activeDNDs.delete(channelId);
            this.save();
            return true;
        }
        return false;
    }

    getDNDOwner(channelId) {
        return this.activeDNDs.get(channelId);
    }
}

module.exports = new DNDStore();
