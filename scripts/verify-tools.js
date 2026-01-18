require('dotenv').config({ path: './.env' });
const openrouter = require('../src/integrations/ai/openrouter');
const toolRegistry = require('../src/core/ai/toolRegistry');

async function testFlow() {
    console.log("Setting up test...");

    // Ensure tools are loaded
    toolRegistry.loadTools();

    console.log("Tools loaded:", toolRegistry.getToolSchemas().map(t => t.function.name));

    const mockContext = {
        userId: '1234567890',
        guildId: 'mock-guild-id',
        contextType: 'text'
    };

    const prompts = [
        "Remind me to check the server in 10 minutes.",
        "Write down a note that I need to buy milk.",
        "Read my notes."
    ];

    for (const prompt of prompts) {
        console.log(`\nUser Prompt: "${prompt}"`);
        try {
            const response = await openrouter.generateResponse(prompt, [], mockContext);
            console.log("---- FINAL RESPONSE ----");
            console.log(response);
            console.log("------------------------");
        } catch (e) {
            console.error("Test failed:", e);
        }
    }

    // Manual Logic Verification for Notes
    console.log("\n---- Manual Logic Check: Manage Notes ----");
    try {
        const addResult = await toolRegistry.executeTool('manage_notes', { action: 'add', content: 'Manual test note' }, mockContext);
        console.log("Add Result:", addResult);

        const listResult = await toolRegistry.executeTool('manage_notes', { action: 'list' }, mockContext);
        console.log("List Result:", listResult);

        // Extract ID
        const idMatch = listResult.match(/\[(.*?)\]/);
        if (idMatch) {
            const delResult = await toolRegistry.executeTool('manage_notes', { action: 'delete', noteId: idMatch[1] }, mockContext);
            console.log("Delete Result:", delResult);
        }
    } catch (e) {
        console.error("Manual check failed:", e);
    }
}

testFlow();
