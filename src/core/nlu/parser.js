function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')   // strip punctuation and symbols
        .replace(/\s+/g, ' ')       // collapse multiple spaces
        .trim();
}

function matchesAny(text, patterns) {
    return patterns.some((re) => re.test(text));
}

function parseIntent(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const t = normalize(rawText);

    // MEDIA NEXT (check before PLAY so "play next song" maps to NEXT)
    if (matchesAny(t, [
        /\b(skip|next)\b/,
        /\b(skip|next)\s+(song|track|one|this)\b/,
        /\bplay\s+next\s+(song|track|one)\b/,
        /\bgo\s+forward\b/
    ])) {
        return { type: 'MEDIA_NEXT' };
    }

    // MEDIA PREVIOUS
    if (matchesAny(t, [
        /\b(previous|prev|back)\b/,
        /\bgo\s+back\b/,
        /\b(previous|last)\s+(song|track|one)\b/,
        /\bplay\s+previous\s+(song|track|one)\b/
    ])) {
        return { type: 'MEDIA_PREV' };
    }

    // MEDIA PAUSE / STOP
    if (matchesAny(t, [
        /\b(pause|stop|halt)\b/,
        /\b(pause|stop)\s+(music|song|track|it|this)\b/,
        /\bturn\s+(off|down)\s+(the\s+)?music\b/
    ])) {
        return { type: 'MEDIA_PAUSE' };
    }

    // MEDIA PLAY / RESUME
    if (matchesAny(t, [
        /\b(play|resume|start)\b/,
        /\b(play|resume|start)\s+(music|song|track|it|this)\b/,
        /\bturn\s+on\s+(the\s+)?music\b/
    ])) {
        return { type: 'MEDIA_PLAY' };
    }

    // MEDIA INFO
    if (matchesAny(t, [
        /\bwhat\s+(song|track)\s+is\s+(this|playing)\b/,
        /\bwhat\s+is\s+this\s+(song|track)\b/,
        /\bwhat\s+am\s+i\s+(listening|listening to)\b/,
        /\bwhat(?:s| is| s)\s+playing\b/,  // Handles "what's", "what is", and normalized "what s"
        /\bwhat(?:s| is| s)\s+this\b.*\b(song|track)\b/
    ])) {
        return { type: 'MEDIA_INFO' };
    }

    return null;
}

module.exports = { parseIntent };



// OLD
// function parseIntent(text) {
//     const t = text.toLowerCase();

//     // Media Controls
//     if (/(pause|stop) (the )?(music|song)/.test(t)) return { type: 'MEDIA_PAUSE' };
//     if (/(resume|play|start) (the )?(music|song)/.test(t)) return { type: 'MEDIA_PLAY' };
//     if (/(skip|next) (the )?(music|song|track)/.test(t)) return { type: 'MEDIA_NEXT' };
//     if (/(previous|back) (the )?(music|song|track)/.test(t)) return { type: 'MEDIA_PREV' };

//     // Media Info
//     if (/(what|whats|what's) (is )?(playing|the song|listening to)/.test(t)) return { type: 'MEDIA_INFO' };

//     return null;
// }

// module.exports = { parseIntent };
