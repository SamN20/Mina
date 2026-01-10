const fs = require('fs');
const path = require('path');

class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.toolsPath = path.join(__dirname, '../../tools');
    }

    /**
     * Loads all tools from the src/tools directory.
     */
    loadTools() {
        if (!fs.existsSync(this.toolsPath)) {
            console.log('[ToolRegistry] Tools directory not found, creating...');
            fs.mkdirSync(this.toolsPath, { recursive: true });
        }

        const files = fs.readdirSync(this.toolsPath).filter(file => file.endsWith('.js'));
        this.tools.clear();

        for (const file of files) {
            try {
                const toolModule = require(path.join(this.toolsPath, file));

                if (toolModule.definition && typeof toolModule.execute === 'function') {
                    const toolName = toolModule.definition.function.name;
                    this.tools.set(toolName, toolModule);
                    console.log(`[ToolRegistry] Loaded tool: ${toolName}`);
                } else {
                    console.warn(`[ToolRegistry] Skipped invalid tool file: ${file}`);
                }
            } catch (error) {
                console.error(`[ToolRegistry] Error loading tool ${file}:`, error);
            }
        }
    }

    /**
     * Returns the array of tool definitions for the AI API.
     * @returns {Array} List of tool schema objects.
     */
    getToolSchemas() {
        return Array.from(this.tools.values()).map(t => t.definition);
    }

    /**
     * Executes a specific tool by name.
     * @param {string} name - The name of the tool function.
     * @param {Object} args - The arguments for the tool.
     * @returns {Promise<string>} The result of the tool execution (stringified).
     */
    async executeTool(name, args) {
        const tool = this.tools.get(name);
        if (!tool) {
            return JSON.stringify({ error: `Tool '${name}' not found` });
        }

        try {
            console.log(`[ToolRegistry] Executing ${name} with args:`, args);
            const result = await tool.execute(args);
            // Ensure result is a string
            return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
            console.error(`[ToolRegistry] Error executing ${name}:`, error);
            return JSON.stringify({ error: error.message });
        }
    }
}

// Singleton instance
const registry = new ToolRegistry();
module.exports = registry;
