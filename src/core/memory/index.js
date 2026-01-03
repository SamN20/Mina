const fs = require('fs');
const path = require('path');
const ai = require('../../integrations/ai');
const vector = require('./vector');
const gamingStore = require('../../features/gaming/store');

const MEMORY_FILE = path.join(process.cwd(), 'data', 'memory.json');
const MEMORY_LOG_FILE = path.join(process.cwd(), 'data', 'memory.log');

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
    if (days > 30) return `(${Math.floor(days/30)} months ago)`;
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

async function learnFromInteraction(userId, userQuery, aiResponse) {
    try {
        const profile = getProfileData(userId);
        const knownName = profile.displayName || "Unknown";
        let queryEmbedding = null;
        try { queryEmbedding = await vector.getEmbedding(userQuery); } catch (e) {}

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

        const extractionPrompt = `
Analyze the interaction between User (${knownName}) and AI (Mina).
Extract new facts to store in long-term memory.
Categorize each fact into: 'personal', 'preferences', 'relationships', or 'trivia'.
Identify if the fact is about the User or the AI.

${existingContext}
${truthContext}

User: "${userQuery}"
AI: "${aiResponse}"

Instructions:
1. **TRUTH CHECK**: If Speaker makes a claim about a Mentioned Person, check [Mentioned People (TRUTH)].
   - If Speaker's claim contradicts Truth, record as: "Speaker *claims* [fact] (Contradicted by Truth)".
2. Extract explicit facts stated by the user about *themselves* (e.g. "I like pizza").
3. Extract explicit facts stated by the AI about *itself* (e.g. "I love JRPGs").
4. **STRICTLY IGNORE** facts about third parties (anyone other than ${knownName} or Mina).
   - **CRITICAL**: If the AI mentions a fact about a third party (e.g. "Sam likes Battlefield"), **DO NOT** attribute this to the User (${knownName}).
   - Example: User asks "What does Sam like?", AI answers "Sam likes apples". Result: NO FACT EXTRACTED.
   - **EXCEPTION**: Only extract if it defines a direct relationship to the User (e.g. "Sam is my friend", "I hate Sam").
5. Do NOT extract questions or temporary states (e.g. "I am hungry").
6. **REMOVAL**: If the User explicitly asks to forget something, or if a new fact contradicts an old memory (visible in Context), add the *exact text* of the old memory to the 'remove' list.
7. Output strictly valid JSON.

Output Format:
{
  "facts": [
    { "text": "User owns a cat named Bo", "category": "personal", "subject": "user" },
    { "text": "Mina loves JRPGs", "category": "preferences", "subject": "ai" },
    { "text": "Speaker claims Joe is German (Contradicted by Truth)", "category": "relationships", "subject": "user" }
  ],
  "remove": [
    { "text": "User owns a dog", "subject": "user" }
  ]
}
`;

        let output = await ai.generateResponse(extractionPrompt);
        
        // Robust JSON extraction
        const jsonStart = output.indexOf('{');
        const jsonEnd = output.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            output = output.substring(jsonStart, jsonEnd + 1);
        } else {
            // Fallback cleanup if no braces found (unlikely but possible)
            output = output.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        let result;
        try {
            result = JSON.parse(output);
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
                    
                    // Check for duplicates (fuzzy check?)
                    // For now, exact string check on text
                    if (!targetProfile.memories.find(m => m.text === item.text)) {
                        // Generate Embedding
                        const embedding = await vector.getEmbedding(item.text);
                        
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

module.exports = {
    getProfileData,
    getContext,
    setProfile,
    clearProfile,
    learnFromInteraction
};
