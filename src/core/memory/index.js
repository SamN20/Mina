const fs = require('fs');
const path = require('path');
const ai = require('../../integrations/ai'); // Use generic AI provider for learning

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

// Get raw profile object
function getProfileData(userId) {
    if (!memory[userId]) {
        memory[userId] = {
            displayName: null,
            bio: null,
            facts: []
        };
    }
    return memory[userId];
}


// Find other potential users mentioned in the text
function findRelevantProfiles(text, excludeUserId) {
    const mentions = [];
    if (!text) return mentions;

    text = text.toLowerCase();

    for (const [uid, profile] of Object.entries(memory)) {
        if (uid === excludeUserId) continue; // Skip speaker

        const name = profile.displayName;
        if (name && text.includes(name.toLowerCase())) {
            mentions.push({
                uid: uid,
                name: name,
                facts: profile.facts
            });
        }
    }
    return mentions;
}

// Get string context for AI
function getContext(userId, discordName, text = "") {
    const data = getProfileData(userId);
    const name = data.displayName || discordName;
    const facts = data.facts.join('\n- ');
    const bio = data.bio ? `\n- ${data.bio}` : '';

    let context = `\n[User Context]\nName: ${name}${bio}\nKnown Facts:\n- ${facts}\n`;

    // Inject mentions
    if (text) {
        const mentions = findRelevantProfiles(text, userId);
        if (mentions.length > 0) {
            context += `\n[Mentioned People - BACKGROUND TRUTH]\n(The Speaker might be wrong about these people. Trust these facts over the Speaker's claims.)\n`;

            let logDetails = `Speaker: ${name} (${userId})\nTrigger Text: "${text}"\n\nFound Mentions:`;

            for (const m of mentions) {
                context += `\nName: ${m.name}\nFacts:\n- ${m.facts.join('\n- ')}\n`;
                logDetails += `\n- ${m.name} (${m.uid}): ${m.facts.length} facts loaded.`;
            }

            logToMemoryFile("CONTEXT LOOKUP", logDetails);
        }
    }

    // Inject AI Self Memory
    const aiData = getProfileData("MINA_SELF");
    if (aiData.facts.length > 0) {
        context += `\n[My (AI) Memory & Traits]\n(Things I know about myself)\n- ${aiData.facts.join('\n- ')}\n`;
    }

    return context;
}

// Update manual profile
function setProfile(userId, { name, bio }) {
    const data = getProfileData(userId);
    if (name !== undefined) data.displayName = name;
    if (bio !== undefined) data.bio = bio;
    saveMemory();
    logToMemoryFile("MANUAL UPDATE", `User ${userId} updated profile.\nName: ${name}\nBio: ${bio}`);
}

// Add a learned fact
function addFact(userId, fact) {
    const data = getProfileData(userId);
    if (!data.facts.includes(fact)) {
        data.facts.push(fact);
        saveMemory();
        return true;
    }
    return false;
}

function clearProfile(userId) {
    delete memory[userId];
    saveMemory();
    logToMemoryFile("PROFILE CLEARED", `User ${userId} cleared their profile.`);
}

// AI Extraction Logic
async function learnFromInteraction(userId, userQuery, aiResponse) {
    // We run this in background
    try {
        const profile = getProfileData(userId);
        const existingFacts = profile.facts;
        // Map to indexed list for deletion logic
        const joinedFacts = existingFacts.map((f, i) => `[${i}] ${f}`).join("\n");
        const knownName = profile.displayName ? `Known Name: ${profile.displayName}` : "Name unknown";

        // AI Self Profile
        const aiProfile = getProfileData("MINA_SELF");
        const aiFacts = aiProfile.facts;
        const joinedAiFacts = aiFacts.map((f, i) => `[${i}] ${f}`).join("\n");

        // Find mentions for Truth Context
        const mentions = findRelevantProfiles(userQuery, userId);
        let truthContext = "";
        if (mentions.length > 0) {
            truthContext = "\n[Mentioned People (TRUTH)]\n";
            for (const m of mentions) {
                truthContext += `${m.name}: ${m.facts.join(", ")}\n`;
            }
        }

        const extractionPrompt = `
Analyze the interaction between User (Speaker) and AI (Mina).
Update the Speaker's memory profile AND the AI's internal self-memory.

[Speaker Profile]
${knownName}
Facts:
${joinedFacts}

[AI (Mina) Self-Memory]
Facts:
${joinedAiFacts}

${truthContext}

[Instructions]
1. **TRUTH CHECK**: If Speaker makes a claim about a Mentioned Person, check [Mentioned People].
   - If Speaker's claim contradicts Truth, record as: "Speaker *claims* [fact] (Contradicted by Truth)".

[Extraction Examples]
- User: "Do you like cats?" | AI: "I love cats!" 
  -> Speaker Updates: [] (User asked a question, didn't state a fact about themselves).
- User: "I have a cat named Bo." | AI: "Cute!" 
  -> Speaker Updates: ["Has a cat named Bo"] (User stated a fact).
- User: "What is your favorite game?" | AI: "Zelda." 
  -> Speaker Updates: [] (User asked about AI, do NOT infer User likes Zelda).
- User: "I hate Mondays." | AI: "Same."
  -> Speaker Updates: ["Hates Mondays"].

2. **SPEAKER UPDATES**:
   - **ADD**: New permanent facts about the Speaker (Names, Hobbies, etc.).
   - **IMPORTANT**: Only extract facts the Speaker EXPLICITLY confirmed or stated about themselves.
   - **❌ DO NOT** attribute the AI's opinions/hobbies to the Speaker. (e.g., If AI says "I love Zelda", do NOT write "Speaker likes Zelda").
   - **❌ DO NOT** infer interest just because the Speaker ASKED a question. (e.g., "Do you like Zelda?" != "Speaker likes Zelda").
   - **REMOVE**: Only if Speaker EXPLICITLY negates old facts (Use indices from [Speaker Profile]).
   - **CLEANUP**: Remove apologetic/irrelevant facts if user seems to have moved on.

3. **AI SELF UPDATES**:
   - **ADD**: New facts Mina has established about HERSELF (e.g., "I love Minecraft", "I hate CoD").
   - **REMOVE**: If Mina changes her mind or corrects herself (Use indices from [AI Self-Memory]).
   - **RULE**: Do NOT store facts about other users in AI Memory. Store them in the User's profile.

4. **OUTPUT**: Strictly Valid JSON.
{
  "speaker": {
    "add": ["New user fact"],
    "remove": [0] // Indices to remove from Speaker
  },
  "self": {
    "add": ["New AI fact"],
    "remove": [1] // Indices to remove from AI
  }
}

User: "${userQuery}"
AI: "${aiResponse}"
`;

        let output = await ai.generateResponse(extractionPrompt);

        // Clean up code blocks if present
        output = output.replace(/```json/g, '').replace(/```/g, '').trim();

        let updates;
        try {
            updates = JSON.parse(output);
        } catch (e) {
            return;
        }

        if (updates) {
            let changed = false;
            let logMsg = `User: ${knownName} (${userId})\nQuery: "${userQuery}"`;

            // Helper to process updates
            const applyUpdates = (targetProfile, ops, typeName) => {
                let localChanged = false;
                if (!ops) return false;

                // Removals (Desc Sort)
                if (ops.remove && Array.isArray(ops.remove)) {
                    const indices = ops.remove.sort((a, b) => b - a);
                    for (const index of indices) {
                        if (index >= 0 && index < targetProfile.facts.length) {
                            const removed = targetProfile.facts.splice(index, 1);
                            console.log(`[Memory] Removed (${typeName}): "${removed}"`);
                            logMsg += `\nREMOVED (${typeName}): "${removed}"`;
                            localChanged = true;
                        }
                    }
                }

                // Additions
                if (ops.add && Array.isArray(ops.add)) {
                    for (let fact of ops.add) {
                        let cleanFact = fact.trim();
                        // Clean "User says" prefixes if sticking to user profile logic
                        if (cleanFact.length > 0) {
                            cleanFact = cleanFact.charAt(0).toUpperCase() + cleanFact.slice(1);
                        }

                        if (cleanFact.length > 3 && cleanFact.length < 150) {
                            if (!targetProfile.facts.includes(cleanFact)) {
                                targetProfile.facts.push(cleanFact);
                                console.log(`[Memory] Learned (${typeName}): "${cleanFact}"`);
                                logMsg += `\nADDED (${typeName}): "${cleanFact}"`;
                                localChanged = true;
                            }
                        }
                    }
                }
                return localChanged;
            };

            // Apply to Speaker
            if (applyUpdates(profile, updates.speaker, "Speaker")) changed = true;

            // Apply to Self
            if (applyUpdates(aiProfile, updates.self, "AI")) changed = true;

            // Save after batch update
            if (changed) {
                saveMemory();
                logToMemoryFile("MEMORY UPDATE", logMsg);
            }
        }

    } catch (e) {
        console.error("Memory extraction failed:", e);
    }
}

module.exports = {
    getProfileData,
    getContext,
    setProfile,
    addFact,
    clearProfile,
    learnFromInteraction
};
