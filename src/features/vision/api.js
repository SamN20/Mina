const crypto = require('crypto');
const memory = require('../../core/memory');
// const fetch = require('node-fetch'); // Native fetch in Node 18+

// Cache (In-Memory)
// Key: Hash of Image URL (or content) + Prompt + Mode
// Value: { result: string, timestamp: number }
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 Hour

// Model Config
const VISION_MODEL = 'google/gemma-3-27b-it:free';

/**
 * Analyze an image using OpenRouter Vision Model
 * @param {string} imageUrl - HTTPS URL of the image
 * @param {string} prompt - Question or instruction (default: "Describe this image")
 * @param {string} mode - 'describe' | 'text' | 'question' (affects system prompt/handling)
 * @returns {Promise<string>} The analysis result
 */
async function analyzeImage(imageUrl, prompt = "Describe this image", mode = 'describe') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error("[Vision] Missing OPENROUTER_API_KEY");
        return "I can't see images right now (missing API key).";
    }

    // Handle data URLs (base64 images from satellite)
    let finalImageUrl = imageUrl;
    if (imageUrl.startsWith('data:image')) {
        // OpenRouter expects HTTPS URLs, so we need to handle base64 differently
        // For now, we'll use the data URL directly - OpenRouter should support it
        finalImageUrl = imageUrl;
    }

    // 1. Check Cache
    const cacheKey = crypto.createHash('md5').update(`${imageUrl}-${prompt}-${mode}`).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`[Vision] Cache Hit for ${imageUrl.substring(0, 30)}...`);
        return cached.result;
    }

    // 2. Prepare Request
    console.log(`[Vision] Analyzing image (${mode}): ${imageUrl.substring(0, 50)}...`);

    let finalPrompt = prompt;
    if (mode === 'text' && prompt === "Describe this image") {
        finalPrompt = "Transcribe all visible text in this image strictly. If no text, say 'No text visible'.";
    }

    const messages = [
        {
            role: "user",
            content: [
                { type: "text", text: finalPrompt },
                {
                    type: "image_url",
                    image_url: {
                        url: imageUrl
                    }
                }
            ]
        }
    ];

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/SamN20/Mina",
                "X-Title": "Mina Vision",
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                messages: messages
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content || "I couldn't make out what that was.";

        // 3. Update Cache
        cache.set(cacheKey, { result, timestamp: Date.now() });

        console.log(`[Vision] Result: ${result.substring(0, 50)}...`);
        return result;

    } catch (error) {
        console.error("[Vision] Error analyzing image:", error);
        return "I tried to look at that image, but something went wrong.";
    }
}

/**
 * Clear the vision cache
 */
function clearCache() {
    cache.clear();
}

/**
 * Store a vision summary in memory (Phase 1.5)
 * Creates a short memory entry tagged as 'vision_discord' without storing raw images
 * @param {string} userId - Discord user ID who posted the image
 * @param {string} imageUrl - URL of the image (for hashing)
 * @param {string} description - Vision analysis result
 * @param {string} [username] - Optional username for the memory text
 */
async function storeVisionMemory(userId, imageUrl, description, username = null) {
    try {
        const profile = memory.getProfileData(userId);
        const displayName = profile.displayName || username || 'User';

        // Create image hash for deduplication
        const imageHash = crypto.createHash('md5').update(imageUrl).digest('hex').substring(0, 8);

        // Create a concise summary memory
        // Format: "Sam posted an image of a broken Gradle build log"
        const summary = description.length > 100
            ? description.substring(0, 100) + '...'
            : description;

        const memoryText = `${displayName} posted an image: ${summary}`;

        // Use memory module's helper function
        const added = await memory.addVisionMemory(userId, memoryText, imageHash);

        if (added) {
            console.log(`[Vision Memory] Stored vision memory for ${displayName}: "${summary.substring(0, 50)}..."`);
        }

    } catch (error) {
        console.error("[Vision Memory] Failed to store vision memory:", error);
    }
}

module.exports = { analyzeImage, clearCache, storeVisionMemory };
