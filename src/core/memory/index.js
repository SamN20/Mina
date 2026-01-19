const fs = require('fs');
const path = require('path');
// Lazy-load AI to avoid circular dependency
// const ai = require('../../integrations/ai');
const vector = require('./vector');
const gamingStore = require('../../features/gaming/store');

// Lazy-load AI module to break circular dependency
let ai = null;
function getAI() {
    if (!ai) {
        ai = require('../../integrations/ai');
    }
    return ai;
}

const MEMORY_FILE = path.join(process.cwd(), 'data', 'memory.json');
const MEMORY_LOG_FILE = path.join(process.cwd(), 'data', 'logs', 'memory.log');

// Ensure log dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data', 'logs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data', 'logs'), { recursive: true });
}

// Ensure data dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'));
}

let memory = {};

// Load memory
if (fs.existsSync(MEMORY_FILE)) {
    try {
        memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        migrateLegacyMemory(); // Trigger background migration
    } catch (e) {
        console.error("Failed to load memory:", e);
    }
}

function saveMemory() {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
    } catch (e) {
        console.error("Failed to save memory:", e);
    }
}

function logToMemoryFile(header, details) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] === ${header} ===\n${details}\n${'-'.repeat(40)}\n`;

    try {
        fs.appendFileSync(MEMORY_LOG_FILE, entry, 'utf8');
    } catch (e) {
        console.error("Failed to write to memory log:", e);
    }
}

// --- Migration & Structure ---

async function migrateLegacyMemory() {
    let changed = false;
    console.log("[Memory] Checking for legacy memories...");

    for (const userId in memory) {
        const profile = memory[userId];

        // Initialize new structure if missing
        if (!profile.memories) {
            profile.memories = [];
            changed = true;
        }

        // Migrate old 'facts' array
        if (profile.facts && Array.isArray(profile.facts) && profile.facts.length > 0) {
            console.log(`[Memory] Migrating ${profile.facts.length} facts for ${userId}...`);
            for (const fact of profile.facts) {
                // Check if already exists in memories to avoid dupes
                if (!profile.memories.find(m => m.text === fact)) {
                    // Generate embedding for legacy fact
                    try {
                        const embedding = await vector.getEmbedding(fact);
                        profile.memories.push({
                            text: fact,
                            category: 'legacy', // Default category for old stuff
                            embedding: embedding,
                            timestamp: Date.now()
                        });
                    } catch (e) {
                        console.error(`[Memory] Failed to embed legacy fact: "${fact}"`, e);
                        // Push without embedding, will be ignored by vector search but maybe kept?
                        // Or just retry later. For now, skip.
                    }
                }
            }
            profile.facts = []; // Clear old array
            changed = true;
        }
    }

    if (changed) {
        saveMemory();
        console.log("[Memory] Migration complete.");
    }
}

// Get raw profile object
function getProfileData(userId) {
    if (!memory[userId]) {
        memory[userId] = {
            displayName: null,
            bio: null,
            memories: [] // { text, category, embedding, timestamp }
        };
    }
    // Ensure memories array exists
    if (!memory[userId].memories) memory[userId].memories = [];
    return memory[userId];
}

function getRelativeTime(timestamp) {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 365) return `(>1 year ago)`;
    if (days > 30) return `(${Math.floor(days / 30)} months ago)`;
    if (days > 0) return `(${days} days ago)`;
    if (hours > 0) return `(${hours} hours ago)`;
    if (minutes > 0) return `(${minutes} mins ago)`;
    return "(just now)";
}

// --- Retrieval ---

async function getContext(userId, discordName, text = "") {
    const data = getProfileData(userId);
    const name = data.displayName || discordName;
    const bio = data.bio ? `\nBio: ${data.bio}` : '';

    // Gaming Context
    let gamingContext = "";
    const gameStats = gamingStore.getUserStats(userId);
    if (gameStats && gameStats.games) {
        const games = Object.entries(gameStats.games)
            .sort((a, b) => b[1].timesSeen - a[1].timesSeen) // Sort by frequency
            .slice(0, 5) // Top 5
            .map(([name, stats]) => name);

        if (games.length > 0) {
            gamingContext = `\nKnown Games: ${games.join(', ')}`;
        }
    }

    let context = `\n[User Context]\nName: ${name}${bio}${gamingContext}\n`;

    // 1. Semantic Search for Relevant Memories
    let relevantMemories = [];
    if (text && data.memories.length > 0) {
        try {
            const queryEmbedding = await vector.getEmbedding(text);

            // Score all memories
            const scored = data.memories.map(m => {
                if (!m.embedding) return { ...m, score: 0 };
                return {
                    ...m,
                    score: vector.cosineSimilarity(queryEmbedding, m.embedding)
                };
            });

            // Filter and Sort
            // Threshold 0.25 is usually decent for MiniLM
            relevantMemories = scored
                .filter(m => m.score > 0.25)
                .sort((a, b) => b.score - a.score)
                .slice(0, 10); // Top 10 relevant facts

        } catch (e) {
            console.error("[Memory] Vector search failed:", e);
            // Fallback: Random recent memories?
            relevantMemories = data.memories.slice(-5);
        }
    } else {
        // No query text (e.g. join event), just show recent
        relevantMemories = data.memories.slice(-5);
    }

    // 2. Recent Memories (Last 15 mins) - For conversation continuity
    const recentTimeWindow = Date.now() - 15 * 60 * 1000;
    const relevantTexts = new Set(relevantMemories.map(m => m.text));

    // User Recent
    const userRecent = data.memories.filter(m =>
        m.timestamp > recentTimeWindow &&
        !relevantTexts.has(m.text)
    );

    // AI Recent (Self)
    const aiProfile = getProfileData("MINA_SELF");
    const aiRecent = aiProfile.memories.filter(m =>
        m.timestamp > recentTimeWindow
    );

    // Combine and sort by timestamp (oldest to newest for flow)
    const recentMemories = [...userRecent, ...aiRecent].sort((a, b) => a.timestamp - b.timestamp);


    // Group by Category
    const categories = {
        personal: [],
        preferences: [],
        relationships: [],
        trivia: [],
        legacy: []
    };

    for (const m of relevantMemories) {
        const cat = m.category || 'trivia';
        const timeStr = getRelativeTime(m.timestamp);
        const entry = `${m.text} ${timeStr}`;

        if (categories[cat]) categories[cat].push(entry);
        else categories.trivia.push(entry);
    }

    // Build Context String
    let logDetails = `User: ${name} (${userId})\nQuery: "${text}"`;

    if (relevantMemories.length > 0) {
        context += `\nRelevant Memories (Retrieved via Semantic Search):\n`;
        logDetails += `\n\nRetrieved Memories:`;

        if (categories.personal.length) {
            context += `[Personal]\n- ${categories.personal.join('\n- ')}\n`;
            logDetails += `\n[Personal] ${categories.personal.join(', ')}`;
        }
        if (categories.preferences.length) {
            context += `[Preferences]\n- ${categories.preferences.join('\n- ')}\n`;
            logDetails += `\n[Preferences] ${categories.preferences.join(', ')}`;
        }
        if (categories.relationships.length) {
            context += `[Relationships]\n- ${categories.relationships.join('\n- ')}\n`;
            logDetails += `\n[Relationships] ${categories.relationships.join(', ')}`;
        }
        if (categories.trivia.length) {
            context += `[Trivia/Other]\n- ${categories.trivia.join('\n- ')}\n`;
            logDetails += `\n[Trivia] ${categories.trivia.join(', ')}`;
        }
        if (categories.legacy.length) {
            context += `[Old Memories]\n- ${categories.legacy.join('\n- ')}\n`;
            logDetails += `\n[Legacy] ${categories.legacy.join(', ')}`;
        }
    } else {
        context += `\n(No relevant memories found for this topic)\n`;
        logDetails += `\nResult: No relevant memories found via search.`;
    }

    // Add Recent Context
    if (recentMemories.length > 0) {
        context += `\n[Recent Conversation Context (Last 15 mins)]\n`;
        logDetails += `\n\n[Recent Context (Last 15 mins)]`;
        for (const m of recentMemories) {
            context += `- ${m.text} ${getRelativeTime(m.timestamp)}\n`;
            logDetails += `\n- ${m.text}`;
        }
    }

    // Log if there was a query
    if (text) {
        logToMemoryFile("MEMORY RETRIEVAL", logDetails);
    }

    // Inject AI Self Memory (Also Semantic?)
    // For now, keep AI memory simple or do the same search
    const aiData = getProfileData("MINA_SELF");
    if (aiData.memories.length > 0 && text) {
        try {
            const queryEmbedding = await vector.getEmbedding(text);
            const aiScored = aiData.memories.map(m => ({
                ...m,
                score: m.embedding ? vector.cosineSimilarity(queryEmbedding, m.embedding) : 0
            }));
            const aiRelevant = aiScored.filter(m => m.score > 0.25).sort((a, b) => b.score - a.score).slice(0, 3);

            if (aiRelevant.length > 0) {
                context += `\n[My (AI) Relevant Memories]\n- ${aiRelevant.map(m => m.text).join('\n- ')}\n`;
            }

            // --- Active Schemes Injection ---
            try {
                // Filter for 'plans' category in AI memories
                // We want ALL active plans, not just semantically relevant ones, 
                // because a plan is a long-term intention that should be top-of-mind.
                // We limit to top 5 most recent to avoid identifying old completed plans (unless we have a 'status' field, which we don't yet).
                // Assuming 'timestamp' is the creation time.
                const activePlans = aiData.memories
                    .filter(m => m.category === 'plans')
                    .sort((a, b) => b.timestamp - a.timestamp) // Newest first
                    .slice(0, 5);

                if (activePlans.length > 0) {
                    context += `\n[Active Schemes & Plans]\n(These are your secret goals. Work towards them casually.)\n- ${activePlans.map(m => m.text).join('\n- ')}\n`;
                    logDetails += `\n[Active Schemes] ${activePlans.length} plans injected.`;
                }
            } catch (e) {
                console.error("[Memory] Failed to inject active schemes:", e);
            }

            // --- Check for Mentioned Users ---
            // Iterate through all known users to see if they are mentioned in the text
            for (const otherId in memory) {
                if (otherId === userId || otherId === "MINA_SELF") continue; // Skip current user and self

                const otherProfile = memory[otherId];
                const otherName = otherProfile.displayName;

                // Simple case-insensitive check
                if (otherName && text.toLowerCase().includes(otherName.toLowerCase())) {
                    // Perform semantic search on this user's memories
                    const otherScored = otherProfile.memories.map(m => ({
                        ...m,
                        score: m.embedding ? vector.cosineSimilarity(queryEmbedding, m.embedding) : 0
                    }));

                    const otherRelevant = otherScored
                        .filter(m => m.score > 0.25)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 5); // Top 5 facts about mentioned user

                    if (otherRelevant.length > 0) {
                        const formattedFacts = otherRelevant.map(m => m.text.replace(/User/g, otherName));
                        context += `\n[Mentioned People - BACKGROUND TRUTH]\n(The Speaker might be wrong about these people. Trust these facts over the Speaker's claims.)\nName: ${otherName}\nFacts:\n- ${formattedFacts.join('\n- ')}\n`;
                        logToMemoryFile("CONTEXT LOOKUP", `Found mention of ${otherName} (${otherId}). Loaded ${otherRelevant.length} facts.`);
                    }
                }
            }

        } catch (e) {
            console.error("[Memory] Error in self/mention lookup:", e);
        }
    }

    return context;
}

// --- Learning ---

async function learnFromInteraction(userId, userQuery, aiResponse, history = [], thoughtContent = "") {
    try {
        const profile = getProfileData(userId);
        const knownName = profile.displayName || "Unknown";
        let queryEmbedding = null;
        try { queryEmbedding = await vector.getEmbedding(userQuery); } catch (e) { }

        // --- Existing Memory Lookup ---
        let existingContext = "";
        if (queryEmbedding) {
            try {
                // User Memories
                const userScored = profile.memories.map(m => ({
                    ...m,
                    score: m.embedding ? vector.cosineSimilarity(queryEmbedding, m.embedding) : 0
                }));
                const userRelevant = userScored.filter(m => m.score > 0.25).sort((a, b) => b.score - a.score).slice(0, 5);

                if (userRelevant.length > 0) {
                    existingContext += `\n[Existing Knowledge about User]\n- ${userRelevant.map(m => m.text).join('\n- ')}\n`;
                }

                // AI Memories
                const aiProfile = getProfileData("MINA_SELF");
                const aiScored = aiProfile.memories.map(m => ({
                    ...m,
                    score: m.embedding ? vector.cosineSimilarity(queryEmbedding, m.embedding) : 0
                }));
                const aiRelevant = aiScored.filter(m => m.score > 0.25).sort((a, b) => b.score - a.score).slice(0, 3);

                if (aiRelevant.length > 0) {
                    existingContext += `\n[Existing Knowledge about AI]\n- ${aiRelevant.map(m => m.text).join('\n- ')}\n`;
                }
            } catch (e) { console.error("[Memory] Existing memory lookup failed:", e); }
        }

        // --- Truth Context Lookup (Restored) ---
        let truthContext = "";
        try {
            if (!queryEmbedding) queryEmbedding = await vector.getEmbedding(userQuery);
            for (const otherId in memory) {
                if (otherId === userId || otherId === "MINA_SELF") continue;
                const otherProfile = memory[otherId];
                const otherName = otherProfile.displayName;

                if (otherName && userQuery.toLowerCase().includes(otherName.toLowerCase())) {
                    const otherScored = otherProfile.memories.map(m => ({
                        ...m,
                        score: m.embedding ? vector.cosineSimilarity(queryEmbedding, m.embedding) : 0
                    }));
                    const otherRelevant = otherScored.filter(m => m.score > 0.25).sort((a, b) => b.score - a.score).slice(0, 5);

                    if (otherRelevant.length > 0) {
                        const formattedFacts = otherRelevant.map(m => m.text.replace(/User/g, otherName));
                        truthContext += `\n[Mentioned People (TRUTH)]\nName: ${otherName}\nFacts:\n- ${formattedFacts.join('\n- ')}\n`;
                    }
                }
            }
        } catch (e) { console.error("[Memory] Truth lookup failed:", e); }

        // --- Active Plans Lookup (for Completion Check) ---
        let activePlansContext = "";
        try {
            const aiData = getProfileData("MINA_SELF");
            const activePlans = aiData.memories
                .filter(m => m.category === 'plans')
                .sort((a, b) => b.timestamp - a.timestamp); // Newest first

            if (activePlans.length > 0) {
                activePlansContext = `\n[Active Plans via Memory]\n(These are plans the AI previously committed to. If they are done, REMOVE them.)\n- ${activePlans.map(m => m.text).join('\n- ')}\n`;
            }
        } catch (e) { console.error("[Memory] Active plans lookup failed:", e); }

        // Format History (Last 10 lines)
        const recentHistory = history.slice(-10).map(m => `[${m.role === 'user' ? 'User' : 'AI'}]: ${m.content}`).join('\n');

        const extractionPrompt = `
Analyze the interaction between User (${knownName}) and AI (Mina).
Extract new facts to store in long-term memory.
Categorize each fact into: 'personal', 'preferences', 'relationships', 'plans', or 'trivia'.
Identify if the fact is about the User or the AI.

${existingContext}
${truthContext}
${activePlansContext}

[Recent Conversation] (CONTEXT ONLY)
${recentHistory}

[Current Interaction] (EXTRACT FACTS FROM HERE)
User: "${userQuery}"
Mina's Secret Thoughts: "${thoughtContent}"
Mina's Spoken Response: "${aiResponse}"

Instructions:
1. **TRUTH CHECK**: If Speaker makes a claim about a Mentioned Person, check [Mentioned People (TRUTH)].
2. Extract explicit facts stated by the User about themselves.
3. Extract explicit facts stated by the AI about itself.
4. **INTERNAL PLANS**: Check [Mina's Secret Thoughts]. Extract *future* plans/schemes.
   - **IGNORE** plans that were executed *immediately* in the [Current Interaction].
     - Bad Fact: "Mina plans to greet User" (She just did it).
     - Good Fact: "Mina plans to verify if User sleeps late *tomorrow*" (Future action).
5. **PLAN COMPLETION**: Check [Active Plans].
   - **Case A: Action Plans** (e.g. "Greet User", "Tell Joke"): If AI did it in the [Current Interaction], REMOVE it.
   - **Case B: Inquiry Plans** (e.g. "Ask User about X", "Find out Y"):
     - ONLY Remove if the User has **Answered**, **Acknowledged**, or **Refused** in the [Current Interaction].
     - If the AI asked the question but the User has NOT answered yet (or this is just the AI asking), **DO NOT REMOVE**. Keep the plan active until resolved.
6. **STRICTLY IGNORE** facts about third parties unless they define a relationship.
7. **BLOCKLIST (DO NOT EXTRACT)**:
   - Current Time, Date, or Weather (e.g. "It is 11:47 PM", "Mina knows the time").
   - Transient States (e.g. "User went to bed", "User is online").
   - Trivial AI Knowledge (e.g. "Mina knows user's name").
8. **NO DUPLICATES**: Do NOT extract facts appearing in [Existing Knowledge].

Output Format:
{
  "facts": [
    { "text": "Mina plans to surprise User", "category": "plans", "subject": "ai" },
    { "text": "User loves pizza", "category": "preferences", "subject": "user" }
  ],
  "remove": [
    { "text": "Mina plans to greet User", "subject": "ai" } 
  ]
}
`;
        const aiModule = getAI();
        let output = await aiModule.generateResponse(extractionPrompt, [], {
            forceThoughts: false,
            systemInstruction: "You are a strict JSON data extractor. Output ONLY valid JSON."
        });

        if (!output) {
            console.log("[Memory] Extraction failed: No output from AI.");
            return;
        }

        // Cleanup markdown if present (e.g. ```json ... ```)
        // Since thoughts are disabled, we don't need the Thought Parser logic here.
        let jsonText = output.replace(/```json/g, '').replace(/```/g, '').trim();

        let result;
        try {
            result = JSON.parse(jsonText);
        } catch (e) {
            console.error("[Memory] JSON Parse Error. Raw output:", output);
            return;
        }

        if (result) {
            let logMsg = `User: ${userId}\nQuery: "${userQuery}"`;
            let changed = false;
            const removedTexts = new Set();

            // Handle Removals
            if (result.remove && Array.isArray(result.remove)) {
                for (const item of result.remove) {
                    const targetId = (item.subject === 'ai') ? "MINA_SELF" : userId;
                    const targetProfile = getProfileData(targetId);

                    const initialLength = targetProfile.memories.length;
                    // Filter out the memory (Exact match, trimmed)
                    targetProfile.memories = targetProfile.memories.filter(m => m.text.trim() !== item.text.trim());

                    if (targetProfile.memories.length < initialLength) {
                        logMsg += `\nREMOVED [${targetId === "MINA_SELF" ? "AI" : "User"}]: "${item.text}"`;
                        removedTexts.add(item.text);
                        changed = true;
                    }
                }
            }

            // Handle Additions
            if (result.facts && Array.isArray(result.facts)) {
                for (const item of result.facts) {
                    // Skip if it was just removed
                    if (removedTexts.has(item.text)) continue;

                    // Determine target profile
                    const targetId = (item.subject === 'ai') ? "MINA_SELF" : userId;
                    const targetProfile = getProfileData(targetId);

                    // VALIDATION CHECK
                    if (!item.text || typeof item.text !== 'string') continue;

                    // Check for duplicates (Exact + Semantic)
                    const exactMatch = targetProfile.memories.find(m => m.text === item.text);
                    if (exactMatch) continue;

                    // Generate Embedding
                    const embedding = await vector.getEmbedding(item.text);

                    // Normalize for Comparison (Swap specific name with "User")
                    // This helps match "Sam is creator" with "User is creator"
                    const normalizeForCheck = (t) => t.replace(new RegExp(knownName, 'gi'), 'User').toLowerCase();
                    const normalizedNew = normalizeForCheck(item.text);

                    // Semantic Check (Threshold 0.80)
                    const duplicate = targetProfile.memories.find(m => {
                        if (!m.embedding) return false;

                        // 1. Check Normalized Text Similarity (Heuristic)
                        const normalizedOld = normalizeForCheck(m.text);
                        if (normalizedNew === normalizedOld) return true;

                        // 2. Vector Similarity
                        const sim = vector.cosineSimilarity(embedding, m.embedding);
                        return sim > 0.80;
                    });

                    if (duplicate) {
                        console.log(`[Memory] Rejected duplicate fact: "${item.text}" (Similar to: "${duplicate.text}")`);
                        logMsg += `\nSKIPPED [Duplicate]: "${item.text}"`;
                        continue;
                    }

                    targetProfile.memories.push({
                        text: item.text,
                        category: item.category || 'trivia',
                        embedding: embedding,
                        timestamp: Date.now()
                    });

                    logMsg += `\nLEARNED [${targetId === "MINA_SELF" ? "AI" : "User"} - ${item.category}]: "${item.text}"`;
                    changed = true;
                }
            }

            if (changed) {
                saveMemory();
                logToMemoryFile("MEMORY UPDATE", logMsg);
            }
        }

    } catch (e) {
        console.error("Memory extraction failed:", e);
    }
}

// --- Utils ---

function setProfile(userId, { name, bio }) {
    const data = getProfileData(userId);
    if (name !== undefined) data.displayName = name;
    if (bio !== undefined) data.bio = bio;
    saveMemory();
    logToMemoryFile("MANUAL UPDATE", `User ${userId} updated profile.\nName: ${name}\nBio: ${bio}`);
}

function clearProfile(userId) {
    delete memory[userId];
    saveMemory();
    logToMemoryFile("PROFILE CLEARED", `User ${userId} cleared their profile.`);
}

/**
 * Search memories for a specific query
 * @param {string} text - Query text
 * @param {number} limit - Max results
 * @param {string} [userId] - Optional User ID to include in search (searches User + AI)
 */
/**
 * Find a user by name (fuzzy match)
 * @param {string} name 
 * @returns {{id: string, name: string}|null}
 */
function findUserByName(name) {
    if (!name) return null;
    const lowerName = name.toLowerCase();

    // 1. Exact ID match
    if (memory[name]) return { id: name, name: memory[name].displayName || name };

    // 2. Exact Name match (case-insensitive)
    for (const userId in memory) {
        if (userId === 'MINA_SELF') continue;
        const profile = memory[userId];
        if (profile.displayName && profile.displayName.toLowerCase() === lowerName) {
            return { id: userId, name: profile.displayName };
        }
    }

    // 3. Partial match (if > 3 chars)
    if (lowerName.length > 3) {
        for (const userId in memory) {
            if (userId === 'MINA_SELF') continue;
            const profile = memory[userId];
            if (profile.displayName && profile.displayName.toLowerCase().includes(lowerName)) {
                return { id: userId, name: profile.displayName };
            }
        }
    }

    return null;
}

async function searchMemories(text, limit = 5, userId = null) {
    if (!text) return [];

    let candidates = [];
    let logBuffer = `Query: "${text}"\nScope: ${userId ? `User(${userId}) + AI` : "AI Only"}\n`;

    try {
        const queryEmbedding = await vector.getEmbedding(text);

        // 1. Search AI Self
        const aiData = getProfileData("MINA_SELF");
        if (aiData.memories.length > 0) {
            candidates.push(...aiData.memories.map(m => ({ ...m, source: 'AI' })));
        }

        // 2. Search User (if provided)
        if (userId) {
            const userData = getProfileData(userId);
            if (userData.memories.length > 0) {
                candidates.push(...userData.memories.map(m => ({ ...m, source: 'User' })));
            }
        }

        // Score
        const scored = candidates.map(m => {
            if (!m.embedding) return { ...m, score: 0 };
            return {
                ...m,
                score: vector.cosineSimilarity(queryEmbedding, m.embedding)
            };
        });

        // Filter, Sort, Limit
        const results = scored
            .filter(m => m.score > 0.3) // Slightly higher threshold for explicit search
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        if (results.length > 0) {
            logBuffer += `\nResults:\n${results.map(r => `[${r.score.toFixed(2)}] [${r.source}] ${r.text}`).join('\n')}`;
        } else {
            logBuffer += `\nNo relevant memories found.`;
        }

        logToMemoryFile("CHAT SEARCH", logBuffer);
        return results;

    } catch (e) {
        console.error("[Memory] Search failed:", e);
        return [];
    }
}

function setExpectingDM(userId, allowed) {
    const data = getProfileData(userId);
    data.expectingDM = allowed;
    // We don't necessarily need to save to disk for this ephemeral state, 
    // but saving ensures it survives restarts.
    saveMemory();
    if (allowed) {
        console.log(`[Memory] Now expecting a DM reply from ${userId}`);
    } else {
        console.log(`[Memory] No longer expecting DM from ${userId}`);
    }
}

function isExpectingDM(userId) {
    const data = getProfileData(userId);
    return !!data.expectingDM;
}

/**
 * Add a vision memory entry (Phase 1.5)
 * Stores a short summary memory tagged as 'vision_discord'
 * @param {string} userId - User ID
 * @param {string} memoryText - The memory text to store
 * @param {string} imageHash - Hash of the image for deduplication
 * @returns {Promise<boolean>} True if memory was added, false if duplicate
 */
async function addVisionMemory(userId, memoryText, imageHash = null) {
    try {
        const profile = getProfileData(userId);
        const existingMemories = profile.memories || [];
        
        // Check for duplicates
        const duplicate = existingMemories.find(m => 
            m.category === 'vision_discord' && 
            (m.text === memoryText || (imageHash && m.metadata?.imageHash === imageHash))
        );
        
        if (duplicate) {
            console.log(`[Memory] Skipping duplicate vision memory for ${userId}`);
            return false;
        }
        
        // Generate embedding
        const embedding = await vector.getEmbedding(memoryText);
        
        // Add memory entry
        profile.memories.push({
            text: memoryText,
            category: 'vision_discord',
            embedding: embedding,
            timestamp: Date.now(),
            metadata: imageHash ? { imageHash: imageHash, source: 'discord' } : { source: 'discord' }
        });
        
        // Save
        saveMemory();
        logToMemoryFile("VISION MEMORY", `User: ${userId}\nAdded: "${memoryText}"`);
        
        return true;
    } catch (error) {
        console.error("[Memory] Failed to add vision memory:", error);
        return false;
    }
}

module.exports = {
    getProfileData,
    getContext,
    setProfile,
    clearProfile,
    learnFromInteraction,
    searchMemories,
    findUserByName,
    setExpectingDM,
    isExpectingDM,
    addVisionMemory
};
