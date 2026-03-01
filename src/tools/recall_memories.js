const memory = require('../core/memory');

const definition = {
    type: "function",
    function: {
        name: "recall_memories",
        description: "Search your long-term memory for facts about a user or topic. Use this when someone asks 'what do you remember about me?', 'do you remember when I said X?', 'what does [person] like?', or similar memory recall questions.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "What to search for in memory (topic, fact, or question)"
                },
                user_name: {
                    type: "string",
                    description: "Optional: name of the user to search memories for. If not provided, searches your own (AI) memories and the current user's memories."
                }
            },
            required: ["query"]
        }
    }
};

async function execute(args, context = {}) {
    const { query, user_name } = args;

    if (!query) {
        return JSON.stringify({ error: "No search query provided" });
    }

    let userId = context.userId || null;

    // If a specific user name was provided, resolve it
    if (user_name) {
        const found = memory.findUserByName(user_name);
        if (found) {
            userId = found.id;
        } else {
            return JSON.stringify({
                result: `I don't have any memories associated with someone named "${user_name}".`,
                memories: []
            });
        }
    }

    try {
        const results = await memory.searchMemories(query, 10, userId);

        if (results.length === 0) {
            return JSON.stringify({
                result: "No relevant memories found for that topic.",
                memories: []
            });
        }

        const formatted = results.map(m => ({
            fact: m.text,
            category: m.category || 'unknown',
            source: m.source || 'unknown',
            relevance: m.score ? m.score.toFixed(2) : 'N/A'
        }));

        return JSON.stringify({
            result: `Found ${formatted.length} relevant memories.`,
            memories: formatted
        });
    } catch (e) {
        console.error("[RecallMemories] Error:", e);
        return JSON.stringify({ error: "Failed to search memories" });
    }
}

module.exports = { definition, execute };
