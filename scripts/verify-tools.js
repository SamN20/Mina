require('dotenv').config({ path: './.env' });
const openrouter = require('../src/integrations/ai/openrouter');
const toolRegistry = require('../src/core/ai/toolRegistry');

async function testFlow() {
    console.log("Setting up test...");

    // Ensure tools are loaded
    toolRegistry.loadTools();

    console.log("Tools loaded:", toolRegistry.getToolSchemas().map(t => t.function.name));

    const prompt = "Please calculate 123 + 456 using your tool.";
    console.log(`\nUser Prompt: "${prompt}"`);

    try {
        const response = await openrouter.generateResponse(prompt, [], { forceThoughts: false });
        console.log("\n---- FINAL RESPONSE ----");
        console.log(response);
        console.log("------------------------");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

testFlow();
