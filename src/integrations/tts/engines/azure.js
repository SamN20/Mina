const sdk = require("microsoft-cognitiveservices-speech-sdk");
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'; // Keeping the persona voice

// Curated list of high-quality Azure Neural voices
const VOICES = [
    { label: 'Xiaoxiao (Chinese - Default)', value: 'zh-CN-XiaoxiaoNeural' },
    { label: 'Jenny (US English)', value: 'en-US-JennyNeural' },
    { label: 'Guy (US English)', value: 'en-US-GuyNeural' },
    { label: 'Aria (US English)', value: 'en-US-AriaNeural' },
    { label: 'Davis (US English)', value: 'en-US-DavisNeural' },
    { label: 'Sonia (UK English)', value: 'en-GB-SoniaNeural' },
    { label: 'Ryan (UK English)', value: 'en-GB-RyanNeural' },
    { label: 'Nanami (Japanese)', value: 'ja-JP-NanamiNeural' },
    { label: 'Keita (Japanese)', value: 'ja-JP-KeitaNeural' },
    { label: 'Denise (French)', value: 'fr-FR-DeniseNeural' },
    { label: 'Conrad (German)', value: 'de-DE-ConradNeural' }
];

// Supported Styles
const STYLES = ['cheerful', 'sad', 'angry', 'whispering', 'chat', 'affectionate', 'fearful', 'calm'];

function getSynthesizer(voiceName) {
    const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);
    speechConfig.speechSynthesisVoiceName = voiceName || DEFAULT_VOICE;
    return speechConfig;
}

function getVoices() {
    return VOICES;
}

/**
 * Parses text and converts custom tags [style]...[/style] to SSML.
 * If no tags, and global style provided, wraps whole text.
 */
function buildSsml(text, voiceName, globalStyle = null) {
    const voice = voiceName || DEFAULT_VOICE;
    let ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">`;
    ssml += `<voice name="${voice}">`;

    // 1. Process custom tags: [cheerful]Text[/cheerful] -> <mstts:express-as style="cheerful">Text</mstts:express-as>
    // Using a simple regex replacement
    let processedText = text;

    // Replace closing tags first
    STYLES.forEach(style => {
        const openTag = `[${style}]`;
        const closeTag = `[/${style}]`;

        // Regex for the pair
        // Note: This is simple and doesn't support nested tags perfectly, but sufficient for simple bot usage.
        const regex = new RegExp(`\\[${style}\\](.*?)\\[/${style}\\]`, 'g');
        processedText = processedText.replace(regex, (match, content) => {
            return `<mstts:express-as style="${style}">${content}</mstts:express-as>`;
        });
    });

    // 2. Global Style
    if (!processedText.includes('<mstts:express-as') && globalStyle && STYLES.includes(globalStyle)) {
        processedText = `<mstts:express-as style="${globalStyle}">${processedText}</mstts:express-as>`;
    }

    ssml += processedText;
    ssml += `</voice></speak>`;
    return ssml;
}

async function generate(text, options = {}) {
    if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
        throw new Error("Azure Speech keys missing.");
    }

    const voiceName = options.code || DEFAULT_VOICE;
    const speechConfig = getSynthesizer(voiceName);
    const tempFile = path.join(os.tmpdir(), `azure_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

    // Create AudioConfig to write to file
    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(tempFile);

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
        // Use SpeakSsmlAsync since we handle formatting manually
        const ssml = buildSsml(text, voiceName, options.style);

        synthesizer.speakSsmlAsync(
            ssml,
            result => {
                synthesizer.close();
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    resolve(tempFile);
                } else {
                    reject(new Error("Azure TTS Synthesis Failed: " + result.errorDetails));
                }
            },
            error => {
                synthesizer.close();
                reject(error);
            }
        );
    });
}

module.exports = { generate, getVoices };
