const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const storage = require('../../core/storage');
const ai = require('../../integrations/ai');

registry.register({
    id: 'SUMMARY',
    patterns: [
        'summariz(e|ed|ing)( .*)?',
        'summary( .*)?',
        'what did we talk about',
        'recap( .*)?',
        'catch me up'
    ],
    execute: async (text, context) => {
        // Default to last 30 minutes for privacy and relevance
        let limitMinutes = 30;

        // Check for explicit time requests
        const hourMatch = text.match(/last (\d+) hour/i);
        const minuteMatch = text.match(/last (\d+) minute/i);

        if (hourMatch) {
            limitMinutes = parseInt(hourMatch[1]) * 60;
        } else if (minuteMatch) {
            limitMinutes = parseInt(minuteMatch[1]);
        }

        // Cap at 2 hours (120 mins) to prevent massive token usage and deep history snooping
        if (limitMinutes > 120) limitMinutes = 120;

        const conversation = storage.getDailyConversation(null, limitMinutes);
        
        if (!conversation || conversation.length < 50) {
            return {
                [ActionType.TTS_SPEAK]: `There hasn't been much conversation in the last ${limitMinutes} minutes to summarize.`
            };
        }

        // Limit conversation length to avoid token limits (simple truncation for now)
        // Keep the LAST 15000 characters (approx 3-4k tokens)
        const truncated = conversation.length > 15000 ? conversation.slice(-15000) : conversation;

        const prompt = `
You are Mina, a helpful AI assistant.
Please summarize the following conversation transcript from the last ${limitMinutes} minutes.
Focus on the main topics discussed and any decisions made.
Keep the summary concise (under 3 sentences) and suitable for reading out loud.
Do not mention timestamps or specific user IDs unless necessary.

Transcript:
${truncated}
`;

        // Use the AI integration to generate the summary
        // Note: generateResponse might return a string with status codes, but usually just text for this prompt
        let summary = await ai.generateResponse(prompt);

        // Clean up any potential status tags if the AI adds them (though unlikely with this prompt)
        summary = summary.replace(/\[status:.*?\]/gi, '').trim();

        return {
            [ActionType.TTS_SPEAK]: summary || "I couldn't generate a summary right now."
        };
    }
});
