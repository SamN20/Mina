const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(process.cwd(), 'data', 'history.json');
const MAX_HISTORY_LENGTH = 60;
const SUMMARIZE_THRESHOLD = 40;  // Trigger summarization when history exceeds this
const KEEP_RECENT = 25;          // Keep this many recent messages unsummarized
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes = new session

// Ensure data dir exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
    fs.mkdirSync(path.join(process.cwd(), 'data'));
}

let history = {};

// Load history
if (fs.existsSync(HISTORY_FILE)) {
    try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to load history:", e);
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (e) {
        console.error("Failed to save history:", e);
    }
}

/**
 * Add a message to the history
 * @param {string} userId - User ID or Context ID
 * @param {string} role - 'user' or 'assistant' or 'system'
 * @param {string} content - Message content
 * @param {string} name - Optional display name
 * @param {Object} [meta] - Optional metadata
 * @param {string} [meta.contextType] - 'voice' | 'text' | 'dm' | 'auto' | 'gaming'
 * @param {string} [meta.channelName] - Channel/context name
 */
function add(userId, role, content, name, meta = {}) {
    if (!history[userId]) {
        history[userId] = [];
    }

    // Strip <thought> tags from assistant messages before storing
    // (thoughts are useful for the current generation but pollute future history context)
    let cleanContent = content;
    if (role === 'assistant' && content) {
        cleanContent = content.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
        if (!cleanContent) cleanContent = content; // fallback if the entire message was a thought
    }

    const entry = {
        role,
        content: cleanContent,
        timestamp: Date.now()
    };

    if (name) entry.name = name;
    if (meta.contextType) entry.contextType = meta.contextType;
    if (meta.channelName) entry.channelName = meta.channelName;

    history[userId].push(entry);

    // Trim
    if (history[userId].length > MAX_HISTORY_LENGTH) {
        history[userId] = history[userId].slice(-MAX_HISTORY_LENGTH);
    }

    saveHistory();
}

/**
 * Get raw history for a user (backward compatible)
 * @param {string} userId 
 * @returns {Array} List of { role, content, timestamp, name?, contextType?, channelName? }
 */
function get(userId) {
    return history[userId] || [];
}

/**
 * Get history with context-change markers and session boundaries injected.
 * Returns a new array with [Context: ...] system entries inserted where the
 * contextType changes between consecutive messages, and [Session Break] entries
 * where there is a gap > SESSION_GAP_MS between messages.
 * 
 * @param {string} userId
 * @returns {Array} Annotated history array
 */
function getWithContextMarkers(userId) {
    const raw = history[userId] || [];
    if (raw.length === 0) return [];

    const result = [];
    let lastContextType = null;
    let lastTimestamp = null;

    for (const entry of raw) {
        // --- Session Break Detection ---
        if (lastTimestamp && entry.timestamp) {
            const gap = entry.timestamp - lastTimestamp;
            if (gap > SESSION_GAP_MS) {
                result.push({
                    role: 'user',
                    content: '[New conversation session — some time has passed since the last interaction.]',
                    timestamp: entry.timestamp,
                    _marker: true
                });
                // Reset context tracking after session break
                lastContextType = null;
            }
        }

        // --- Context Change Detection ---
        const currentContext = entry.contextType || null;
        if (currentContext && lastContextType && currentContext !== lastContextType) {
            const contextLabel = _contextLabel(currentContext, entry.channelName);
            const fromLabel = _contextLabel(lastContextType);
            result.push({
                role: 'user',
                content: `[Context changed: ${fromLabel} → ${contextLabel}]`,
                timestamp: entry.timestamp,
                _marker: true
            });
        }

        result.push(entry);
        if (currentContext) lastContextType = currentContext;
        if (entry.timestamp) lastTimestamp = entry.timestamp;
    }

    return result;
}

/**
 * Get the last N messages as plain text (for query expansion in memory retrieval)
 * @param {string} userId
 * @param {number} n - Number of recent messages to return
 * @returns {string[]} Array of content strings (user messages only)
 */
function getRecentText(userId, n = 3) {
    const raw = history[userId] || [];
    // Filter to user messages, take last N
    return raw
        .filter(m => m.role === 'user')
        .slice(-n)
        .map(m => m.content);
}

/**
 * Check if there's been a session gap since the last message
 * @param {string} userId
 * @returns {boolean}
 */
function hasSessionGap(userId) {
    const raw = history[userId] || [];
    if (raw.length === 0) return true;
    const lastEntry = raw[raw.length - 1];
    if (!lastEntry.timestamp) return false;
    return (Date.now() - lastEntry.timestamp) > SESSION_GAP_MS;
}

/**
 * Summarize old history entries to reduce token usage.
 * When history exceeds SUMMARIZE_THRESHOLD, the oldest entries (everything except
 * the last KEEP_RECENT) are summarized into a single system message.
 * 
 * This is async and should be called non-blocking (fire and forget after response).
 * 
 * @param {string} userId
 */
async function summarizeOldHistory(userId) {
    const raw = history[userId] || [];
    if (raw.length <= SUMMARIZE_THRESHOLD) return;

    // If already has a summary, only re-summarize when significantly more messages have accumulated
    if (raw[0] && raw[0]._summary) {
        const realMessageCount = raw.filter(m => !m._summary && !m._marker).length;
        // Need at least 20 new messages beyond KEEP_RECENT before re-summarizing
        if (realMessageCount <= KEEP_RECENT + 20) return;
    }

    // Split: old messages to summarize vs recent to keep
    const toSummarize = [];
    const toKeep = [];

    // Separate existing summaries, markers, and real messages
    const realMessages = raw.filter(m => !m._marker);

    if (realMessages.length <= SUMMARIZE_THRESHOLD) return;

    const cutoff = realMessages.length - KEEP_RECENT;
    const oldMessages = realMessages.slice(0, cutoff);
    const recentMessages = realMessages.slice(cutoff);

    // Build text to summarize
    const oldText = oldMessages.map(m => {
        if (m._summary) return `[Previous Summary: ${m.content}]`;
        const prefix = m.name || m.role;
        const ctx = m.contextType ? ` (${m.contextType})` : '';
        return `${prefix}${ctx}: ${m.content}`;
    }).join('\n');

    if (oldText.length < 50) return; // Not worth summarizing

    try {
        // Lazy-load AI to avoid circular dependency
        const ai = require('../integrations/ai');

        const summaryPrompt = `Summarize this conversation history in 2-3 concise sentences. 
Note any important personal information shared, key topics discussed, emotions expressed, and context changes (voice/text/DM).
Do NOT include timestamps. Focus on what matters for continuing the conversation.

Conversation:
${oldText}`;

        const summary = await ai.generateResponse(summaryPrompt, [], {
            forceThoughts: false,
            systemInstruction: 'You are a concise conversation summarizer. Output ONLY the summary, nothing else.'
        });

        if (summary && summary.length > 10) {
            // Replace old messages with summary + keep recent
            history[userId] = [
                {
                    role: 'system',
                    content: `[Earlier conversation summary: ${summary.trim()}]`,
                    timestamp: oldMessages[oldMessages.length - 1]?.timestamp || Date.now(),
                    _summary: true
                },
                ...recentMessages
            ];
            saveHistory();
            console.log(`[History] Summarized ${oldMessages.length} old messages for ${userId}`);
        }
    } catch (e) {
        console.error("[History] Summarization failed:", e);
    }
}

/**
 * Clear history for a user
 * @param {string} userId 
 */
function clear(userId) {
    if (history[userId]) {
        delete history[userId];
        saveHistory();
    }
}

// --- Helpers ---

function _contextLabel(contextType, channelName) {
    switch (contextType) {
        case 'voice': return channelName ? `Voice (${channelName})` : 'Voice Chat';
        case 'text': return channelName ? `#${channelName}` : 'Text Chat';
        case 'dm': return 'Direct Message';
        case 'auto': return channelName ? `#${channelName} (passive)` : 'Text Chat (passive)';
        case 'gaming': return 'Gaming Comment';
        default: return contextType || 'Unknown';
    }
}

module.exports = {
    add,
    get,
    getWithContextMarkers,
    getRecentText,
    hasSessionGap,
    summarizeOldHistory,
    clear
};
