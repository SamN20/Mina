const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Detect Python command based on OS
// On Linux, use the venv Python to ensure packages are available
const isWin = process.platform === 'win32';
const PYTHON_CMD = isWin 
    ? 'python' 
    : path.join(__dirname, '..', '..', 'venv', 'bin', 'python3');

async function generate(text, options = {}) {
    const tempDir = path.resolve(__dirname, '../../temp_tts');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, `vibe-${Date.now()}-${Math.floor(Math.random() * 1000)}.wav`);

    // Path to the wrapper script we will create
    const wrapperScript = path.join(__dirname, 'vibevoice_wrapper.py');

    // We assume the environment is set up (pip install done)
    // Args: OutputPath "Text to speak"

    return new Promise((resolve, reject) => {
        const process = spawn(PYTHON_CMD, [wrapperScript, tempFile, text]);

        process.on('close', (exitCode) => {
            if (exitCode !== 0) {
                console.error(`VibeVoice Generation failed (Code ${exitCode})`);
                resolve(null);
                return;
            }

            if (!fs.existsSync(tempFile)) {
                console.error("VibeVoice file not created");
                resolve(null);
                return;
            }
            resolve(tempFile);
        });

        process.stderr.on('data', (data) => {
            console.error(`VibeVoice Py: ${data.toString()}`);
        });
    });
}

module.exports = { generate };
