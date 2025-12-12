const { SlashCommandBuilder } = require('discord.js');
const storage = require('../src/core/storage');

// Simple cache for models
const FALLBACK_MODELS = [
    { name: 'Google: Gemini 2.0 Flash Exp (Free)', value: 'google/gemini-2.0-flash-exp:free' },
    { name: 'Meta: Llama 3.3 70B (Free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
    { name: 'Meta: Llama 3 8B (Free)', value: 'meta-llama/llama-3-8b-instruct:free' },
    { name: 'DeepSeek: R1 (Free)', value: 'deepseek/deepseek-r1:free' },
    { name: 'DeepSeek: V3 (Free)', value: 'deepseek/deepseek-v3:free' },
];

let modelCache = FALLBACK_MODELS; // Start with fallback
let lastFetch = 0;
const CACHE_TTL = 3600 * 1000; // 1 hour

async function fetchModels() {
    const now = Date.now();
    // Return cache immediately if valid (and has more than just fallbacks, or if we want to rely on fallbacks for a bit)
    if (modelCache.length > FALLBACK_MODELS.length && (now - lastFetch < CACHE_TTL)) {
        return modelCache;
    }

    // Background update if cache is stale but exists? 
    // For autocomplete, we need speed.
    // If we have fallbacks, we can return them while fetching?
    // But then user won't see new stuff.
    // Let's try to fetch with a timeout.

    try {
        console.log("Fetching models from OpenRouter...");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

        const response = await fetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
        clearTimeout(timeout);

        const json = await response.json();

        if (json.data) {
            // Filter for FREE models. Pricing is usually string or number.
            const freeModels = json.data.filter(m => {
                const prompt = parseFloat(m.pricing?.prompt || "1");
                const completion = parseFloat(m.pricing?.completion || "1");
                return prompt === 0 && completion === 0;
            });

            // Map and Sort
            const mapped = freeModels.map(m => ({
                name: m.name.substring(0, 100), // Discord limit
                value: m.id
            })).sort((a, b) => a.name.localeCompare(b.name));

            modelCache = mapped;
            lastFetch = now;
            console.log(`Cached ${modelCache.length} free models.`);
            return modelCache;
        }
    } catch (e) {
        console.error("Error fetching OpenRouter models:", e);
    }

    return modelCache; // Return existing (fallback or old)
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setmodel')
        .setDescription('Set the AI model for OpenRouter (Admin Only)')
        .addStringOption(option =>
            option.setName('model')
                .setDescription('Search for a FREE model')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Ensure cache is populated
        let choices = await fetchModels();

        // Filter choices based on user input
        if (focusedValue) {
            choices = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue) || choice.value.toLowerCase().includes(focusedValue));
        }

        // Cap at 25 results (Discord API Limit)
        const sliced = choices.slice(0, 25);

        await interaction.respond(sliced);
    },

    async execute(interaction) {
        // Admin Check
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const selectedModel = interaction.options.getString('model');
        storage.setAiModel(selectedModel);

        await interaction.reply({
            content: `🧠 **AI Model Updated**\nNow using: \`${selectedModel}\``,
            ephemeral: false
        });
    },
};
