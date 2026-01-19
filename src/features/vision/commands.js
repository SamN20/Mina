/**
 * Phase 3: Vision Command Handlers
 * Handles on-demand vision requests like "what am I looking at" and "what's on my screen"
 */

const registry = require('../../core/commands/registry');
const { ActionType } = require('../../core/types');
const satellite = require('../../integrations/satellite');
const vision = require('./api');
const fs = require('fs');
const path = require('path');

/**
 * Request a vision snapshot and process it
 * @param {string} userId - User ID
 * @param {string} snapshotType - 'webcam' or 'screen'
 * @param {boolean} useOCR - Whether to use OCR first
 * @param {string} prompt - Optional prompt for vision analysis
 * @returns {Promise<string>} Response text
 */
async function requestAndProcessSnapshot(userId, snapshotType, useOCR = false, prompt = null) {
    // Check if user has vision satellite connected
    if (!satellite.hasVisionCapability(userId)) {
        return "I don't have access to your vision satellite right now. Make sure your vision client is connected.";
    }

    try {
        // Request snapshot with OCR if needed
        const snapshot = await satellite.requestVisionSnapshot(userId, snapshotType, useOCR);
        
        if (!snapshot || !snapshot.imageData) {
            return `I couldn't capture a ${snapshotType} snapshot. Make sure your vision client is running and ${snapshotType === 'webcam' ? 'webcam' : 'screen capture'} is enabled.`;
        }

        // If OCR is requested and available, use it first
        if (useOCR && snapshot.ocrText) {
            const ocrText = snapshot.ocrText.trim();
            if (ocrText && ocrText.length > 0) {
                return `I can see this text on your ${snapshotType}:\n\n${ocrText}`;
            }
        }

        // Convert base64 to data URL for vision API
        const imageDataUrl = `data:image/jpeg;base64,${snapshot.imageData}`;
        
        // Use vision API to analyze
        const defaultPrompt = snapshotType === 'webcam' 
            ? "What am I looking at? Describe what you see in this image."
            : "What's on this screen? Describe what you see.";
        
        const analysisPrompt = prompt || defaultPrompt;
        const result = await vision.analyzeImage(imageDataUrl, analysisPrompt, 'describe');
        
        return result;
    } catch (error) {
        console.error(`[Vision Commands] Error processing ${snapshotType} snapshot:`, error);
        return `I had trouble processing the ${snapshotType} snapshot. ${error.message}`;
    }
}

// Register "what's on my screen" command FIRST (more specific, should match before webcam)
registry.register({
    id: 'VISION_SCREEN',
    patterns: [
        'what\'s on my screen',
        'what is on my screen',
        'what\'s on the screen',
        'what is on the screen',
        'show me my screen',
        'describe my screen',
        'what do you see on my screen',
        'what can you see on my screen',
        'what\'s showing on my screen',
        'what is showing on my screen'
    ],
    execute: async (text, context) => {
        const userId = context.userId;
        // For screen, try OCR first, then vision if needed
        const result = await requestAndProcessSnapshot(userId, 'screen', true, "What's on this screen? Describe what you see.");
        return { [ActionType.TTS_SPEAK]: result };
    }
});

// Register "what am I looking at" command (webcam-specific patterns)
registry.register({
    id: 'VISION_WEBCAM',
    patterns: [
        'what am i looking at',
        'what am i seeing',
        'what\'s in front of me',
        'what is in front of me',
        'look at me',
        'what do you see in front of me',
        'describe what\'s in front of me'
    ],
    execute: async (text, context) => {
        const userId = context.userId;
        const result = await requestAndProcessSnapshot(userId, 'webcam', false, "What am I looking at? Describe what you see in this image.");
        return { [ActionType.TTS_SPEAK]: result };
    }
});

// Register "read this error" / OCR command
registry.register({
    id: 'VISION_OCR',
    patterns: [
        'read this error',
        'read the error',
        'what does this error say',
        'read the text on my screen',
        'read my screen',
        'what text is on my screen',
        'read what\'s on my screen',
        'read the error message',
        'what error am i getting'
    ],
    execute: async (text, context) => {
        const userId = context.userId;
        
        if (!satellite.hasVisionCapability(userId)) {
            return { [ActionType.TTS_SPEAK]: "I don't have access to your vision satellite right now. Make sure your vision client is connected." };
        }

        try {
            const snapshot = await satellite.requestVisionSnapshot(userId, 'screen', true);
            
            if (!snapshot || !snapshot.imageData) {
                return { [ActionType.TTS_SPEAK]: "I couldn't capture a screen snapshot. Make sure your vision client is running and screen capture is enabled." };
            }

            // Use OCR only
            if (snapshot.ocrText) {
                let ocrText = snapshot.ocrText.trim();
                
                if (ocrText && ocrText.length > 0) {
                    // If OCR text is very long, try to extract key information
                    // Look for error patterns, or summarize
                    if (ocrText.length > 500) {
                        // Try to find error messages or important text
                        const errorPatterns = [
                            /error[:\s]+([^\n]{1,200})/i,
                            /exception[:\s]+([^\n]{1,200})/i,
                            /failed[:\s]+([^\n]{1,200})/i,
                            /warning[:\s]+([^\n]{1,200})/i
                        ];
                        
                        let foundError = null;
                        for (const pattern of errorPatterns) {
                            const match = ocrText.match(pattern);
                            if (match) {
                                foundError = match[1].trim();
                                break;
                            }
                        }
                        
                        if (foundError) {
                            ocrText = foundError;
                        } else {
                            // Take first few lines or last few lines (often where errors are)
                            const lines = ocrText.split('\n').filter(l => l.trim().length > 0);
                            if (lines.length > 10) {
                                // Take first 3 and last 3 lines
                                ocrText = lines.slice(0, 3).join('\n') + '\n...\n' + lines.slice(-3).join('\n');
                            } else {
                                ocrText = ocrText.substring(0, 500) + '...';
                            }
                        }
                    }
                    
                    return { [ActionType.TTS_SPEAK]: `I can read this text on your screen:\n\n${ocrText}` };
                } else {
                    return { [ActionType.TTS_SPEAK]: "I couldn't find any readable text on your screen." };
                }
            } else {
                // Fallback to vision API with OCR mode, but ask for summary if too much text
                const imageDataUrl = `data:image/jpeg;base64,${snapshot.imageData}`;
                const result = await vision.analyzeImage(
                    imageDataUrl, 
                    "Extract and summarize any error messages or important text from this screen. If there's a lot of text, focus on errors, warnings, or key information. If no text, say 'No text visible'.", 
                    'text'
                );
                return { [ActionType.TTS_SPEAK]: result };
            }
        } catch (error) {
            console.error('[Vision Commands] Error reading screen:', error);
            return { [ActionType.TTS_SPEAK]: `I had trouble reading your screen. ${error.message}` };
        }
    }
});

module.exports = {
    requestAndProcessSnapshot
};
