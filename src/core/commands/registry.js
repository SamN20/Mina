/**
 * Command Registry
 * Handles registration and lookup of non-LLM commands (Music, Reminders, etc.)
 */

class CommandRegistry {
    constructor() {
        this.commands = [];
    }

    /**
     * Register a new command
     * @param {Object} command
     * @param {string} command.id - Unique ID
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
        for (const cmd of this.commands) {
            // Check Patterns
            if (cmd.patterns) {
                for (const pattern of cmd.patterns) {
                    const regex = new RegExp(pattern, 'i');
                    if (regex.test(text)) {
                        return { command: cmd, matches: text.match(regex) };
                    }
                }
            }

            // Check Custom Matcher
            if (cmd.matcher && cmd.matcher(text, context)) {
                return { command: cmd, matches: null };
            }
        }
        return null;
    }
}

module.exports = new CommandRegistry();
