require('dotenv').config({ path: './.env' });
const toolRegistry = require('../src/core/ai/toolRegistry');

async function verifySmartSearch(query) {
    console.log("Loading tools...");
    toolRegistry.loadTools();

    console.log(`\n--- Testing Smart Search: "${query}" ---`);
    console.log("(This may take a moment to load the model and fetch pages...)");

    try {
        const resultJSON = await toolRegistry.executeTool('smart_search', { query });
        const result = JSON.parse(resultJSON);

        console.log("\n--- RESULT ---");
        console.log(JSON.stringify(result, null, 2));

        if (result.answer && result.confidence > 0.1) {
            console.log("\n✅ SUCCESS: Found an answer.");
        } else {
            console.log("\n⚠️ WARNING: Low confidence or no answer.");
        }

    } catch (e) {
        console.error("\n❌ ERROR:", e);
    }
}

// Test with a known fact
// Test with CLI arg or default
const query = process.argv[2] || "Who is the creator of Discord?";
verifySmartSearch(query);
