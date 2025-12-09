const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Detect Python command based on OS
// On Linux, use the venv Python to ensure gTTS is available
const isWin = process.platform === 'win32';
const PYTHON_CMD = isWin 
    ? 'python' 
    : path.join(__dirname, '..', '..', 'venv', 'bin', 'python3');

// Helper for gTTS mapping
function getGttsParams(code) {
    const mapping = {
        'en-US': { lang: 'en', tld: 'com' },
        'en-GB': { lang: 'en', tld: 'co.uk' },
        'en-AU': { lang: 'en', tld: 'com.au' },
        'en-IN': { lang: 'en', tld: 'co.in' },
        'fr-FR': { lang: 'fr', tld: 'fr' },
        'de-DE': { lang: 'de', tld: 'de' },
        'es-ES': { lang: 'es', tld: 'es' },
        'it-IT': { lang: 'it', tld: 'it' },
        'ja-JP': { lang: 'ja', tld: 'co.jp' },
        'ko-KR': { lang: 'ko', tld: 'co.kr' },
        'pt-BR': { lang: 'pt', tld: 'com.br' },
        'ru-RU': { lang: 'ru', tld: 'ru' }
    };
    return mapping[code] || { lang: 'en', tld: 'com' };
}

async function generate(text, options = {}) {
    const { code = 'en-US' } = options;
    const safeText = text.replace(/"/g, '\\"');
    const { lang, tld } = getGttsParams(code);

    const tempDir = path.resolve(__dirname, '../../temp_tts');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `gtts-${Date.now()}-${Math.floor(Math.random() * 1000)}.mp3`);

    const pythonScript = `
from gtts import gTTS
import sys

sys.stdout.reconfigure(encoding='utf-8')

try:
    tts = gTTS("${safeText}", lang="${lang}", tld="${tld}")
    tts.save(r"${tempFile}")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
    `;

    return new Promise((resolve, reject) => {
        const process = spawn(PYTHON_CMD, ['-c', pythonScript]);

        process.on('close', (exitCode) => {
            if (exitCode !== 0) {
                console.error(`TTS Generation failed with code ${exitCode}`);
                resolve(null);
                return;
            }

            if (!fs.existsSync(tempFile)) {
                console.error("TTS file not created:", tempFile);
                resolve(null);
                return;
            }
            resolve(tempFile);
        });

        process.stderr.on('data', (data) => {
            console.error(`TTS Python Error: ${data.toString()}`);
        });
    });
}

module.exports = { generate };
