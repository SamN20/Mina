const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Detect Python command based on OS
// On Linux, use the venv Python to ensure edge-tts is available
const isWin = process.platform === 'win32';
const PYTHON_CMD = isWin 
    ? 'python' 
    : path.join(__dirname, '..', '..', 'venv', 'bin', 'python3');

const VOICES = [
    { label: '🇺🇸 English (US) - Christopher', value: 'en-US-ChristopherNeural' },
    { label: '🇺🇸 English (US) - Aria', value: 'en-US-AriaNeural' },
    { label: '🇺🇸 English (US) - Guy', value: 'en-US-GuyNeural' },
    { label: '🇬🇧 English (UK) - Sonia', value: 'en-GB-SoniaNeural' },
    { label: '🇬🇧 English (UK) - Ryan', value: 'en-GB-RyanNeural' },
    { label: '🇦🇺 English (AU) - Natasha', value: 'en-AU-NatashaNeural' },
    { label: '🇦🇺 English (AU) - William', value: 'en-AU-WilliamNeural' },
    { label: '🇨🇦 English (CA) - Clara', value: 'en-CA-ClaraNeural' },
    { label: '🇫🇷 French - Denise', value: 'fr-FR-DeniseNeural' },
    { label: '🇩🇪 German - Katja', value: 'de-DE-KatjaNeural' },
    { label: '🇯🇵 Japanese - Nanami', value: 'ja-JP-NanamiNeural' },
    { label: '🇰🇷 Korean - SunHi', value: 'ko-KR-SunHiNeural' },
    { label: '🇧🇷 Portuguese (BR) - Francisca', value: 'pt-BR-FranciscaNeural' },
    { label: '🇨🇳 Chinese (Mainland) - Xiaoxiao', value: 'zh-CN-XiaoxiaoNeural' }
];

function getVoices() {
    return VOICES;
}

// Simple mapping for legacy codes (en-US, en-GB) to Edge voices
const LEGACY_MAPPING = {
    'en-US': 'en-US-ChristopherNeural',
    'en-GB': 'en-GB-RyanNeural',
    'en-AU': 'en-AU-NatashaNeural',
    'fr-FR': 'fr-FR-DeniseNeural',
    'de-DE': 'de-DE-KatjaNeural',
    'ja-JP': 'ja-JP-NanamiNeural',
    'es-ES': 'es-ES-ElviraNeural',  // assuming standard
    'it-IT': 'it-IT-ElsaNeural',    // assuming standard
    'ru-RU': 'ru-RU-SvetlanaNeural',// assuming standard
    'ko-KR': 'ko-KR-SunHiNeural',
    'pt-BR': 'pt-BR-FranciscaNeural'
};

const DEFAULT_VOICE = 'en-GB-RyanNeural'; // User requested default

async function generate(text, options = {}) {
    // 1. Determine Voice
    // options.code might be a full ID (from setvoice) OR a short code (from default voiceHandler)
    let voice = options.code || options.voice || DEFAULT_VOICE;

    // Check if it's a short legacy code and map it
    if (LEGACY_MAPPING[voice]) {
        voice = LEGACY_MAPPING[voice];
    }
    // If it looks like a short code but not in mapping, fallback to default to prevent crash
    else if (voice.length === 5 && voice.includes('-')) {
        console.warn(`EdgeTTS: Unknown legacy code '${voice}', falling back to default.`);
        voice = DEFAULT_VOICE;
    }

    const safeText = text.replace(/"/g, '\\"');

    const tempDir = path.resolve(__dirname, '../../temp_tts');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}.mp3`);

    console.log(`[EdgeTTS] Generating with Voice: "${voice}"`);

    return new Promise((resolve, reject) => {
        const process = spawn(PYTHON_CMD, [
            '-m', 'edge_tts',
            '--voice', voice,
            '--text', safeText,
            '--write-media', tempFile
        ]);

        process.on('close', (exitCode) => {
            if (exitCode !== 0) {
                console.error(`Edge-TTS failed with code ${exitCode}`);
                resolve(null);
                return;
            }

            if (!fs.existsSync(tempFile)) {
                console.error("Edge-TTS file not created:", tempFile);
                resolve(null);
                return;
            }
            resolve(tempFile);
        });

        // Enable logging for debugging
        process.stderr.on('data', (data) => {
            const msg = data.toString();
            // Ignore benign progress bars or info, log errors
            if (msg.toLowerCase().includes('error')) {
                console.error(`EdgeTTS Error: ${msg}`);
            }
        });

        process.on('error', (err) => {
            console.error("Failed to start edge-tts.", err);
            resolve(null);
        });
    });
}

module.exports = { generate, getVoices };
