const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DISABLED_FILE = path.join(DATA_DIR, 'disabled_commands.json');

/**
 * Command Registry
 * Handles registration and lookup of non-LLM commands (Music, Reminders, etc.)
 */

class CommandRegistry {
    constructor() {
        this.commands = [];
        this.disabledCommands = new Set();
        this.loadDisabledCommands();
    }

    loadDisabledCommands() {
        if (fs.existsSync(DISABLED_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(DISABLED_FILE, 'utf8'));
                this.disabledCommands = new Set(data);
            } catch (e) {
                console.error("Failed to load disabled commands:", e);
            }
        }
    }

    saveDisabledCommands() {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(DISABLED_FILE, JSON.stringify([...this.disabledCommands], null, 2));
        } catch (e) {
            console.error("Failed to save disabled commands:", e);
        }
    }

    /**
     * Register a new command
     * @param {Object} command
     * @param {string} command.id - Unique ID
     * @param {string} [command.title] - Human readable title for admin UI
     * @param {string} [command.description] - Description for admin UI
     * @param {boolean} [command.canDisable] - Whether this command can be disabled via admin UI
     * @param {string[]} [command.patterns] - Regex patterns to match
     * @param {Function} [command.matcher] - Custom matcher function (text, context) => boolean
     * @param {Function} command.execute - (text, context) => Promise<ActionPlan>
     */
    register(command) {
        this.commands.push(command);
        console.log(`[Registry] Registered command: ${command.id}`);
    }

    /**
     * Find a matching command for the given input
     * @param {string} text 
     * @param {Object} context 
     * @returns {Object|null} Matching command or null
     */
    findMatch(text, context) {
        // First pass: Check pattern-based commands (more specific)
        for (const cmd of this.commands) {
            // Check if disabled
            if (this.disabledCommands.has(cmd.id)) continue;

            // Check Patterns first (pattern-based commands are usually more specific)
            if (cmd.patterns) {
                for (const pattern of cmd.patterns) {
                    const regex = new RegExp(pattern, 'i');
                    if (regex.test(text)) {
                        return { command: cmd, matches: text.match(regex) };
                    }
                }
            }
        }
        
        // Second pass: Check custom matchers (intent-based, less specific)
        for (const cmd of this.commands) {
            // Check if disabled
            if (this.disabledCommands.has(cmd.id)) continue;

            // Check Custom Matcher (only if no patterns matched)
            if (cmd.matcher && cmd.matcher(text, context)) {
                return { command: cmd, matches: null };
            }
        }
        return null;
    }

    // --- Admin Management ---

    getDisableableCommands() {
        return this.commands.filter(cmd => cmd.canDisable);
    }

    isCommandDisabled(id) {
        return this.disabledCommands.has(id);
    }

    setCommandState(id, enabled) {
        const cmd = this.commands.find(c => c.id === id);
        if (!cmd) return false;
        if (!cmd.canDisable) return false; // Cannot toggle this command

        if (enabled) {
            this.disabledCommands.delete(id);
        } else {
            this.disabledCommands.add(id);
        }
        this.saveDisabledCommands();
        return true;
    }
}

module.exports = new CommandRegistry();
