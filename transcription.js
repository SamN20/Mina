const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Select transcription engine: 'vosk' or 'whisper'
const TRANSCRIPTION_ENGINE = process.env.TRANSCRIPTION_ENGINE || 'vosk';
const PYTHON_SCRIPT = TRANSCRIPTION_ENGINE === 'whisper' 
    ? path.join(__dirname, 'transcribe_whisper.py')
    : path.join(__dirname, 'transcribe.py');

// Detect Python command based on OS
// On Linux, use the venv Python to ensure vosk is available
const isWin = process.platform === 'win32';
const PYTHON_CMD = isWin 
    ? 'python' 
    : path.join(__dirname, 'venv', 'bin', 'python3');

console.log(`Transcription Engine: ${TRANSCRIPTION_ENGINE.toUpperCase()} (${PYTHON_SCRIPT})`);

// Function to handle a PCM stream
function transcribeStream(inputStream, userId, callback) {
    // Spawn python process
    // python transcribe.py
    // Stdin: PCM data
    // Stdout: JSON lines

    const pythonProcess = spawn(PYTHON_CMD, [PYTHON_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }  // Pass environment variables to subprocess
    });

    pythonProcess.on('error', (err) => {
        console.error(`timestamp: ${Date.now()} - Failed to spawn python process for user ${userId}:`, err);
    });

    // Pipe input audio to python stdin
    inputStream.pipe(pythonProcess.stdin).on('error', (err) => {
        console.error(`[Pipe Error] Error piping audio to python for ${userId}:`, err);
    });

    pythonProcess.stdin.on('error', (err) => {
        // This often happens if the python process dies and we try to write to it
        console.error(`[Stdin Error] Python stdin error for ${userId}:`, err);
    });

    // Handle output from python
    let buffer = '';
    pythonProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const res = JSON.parse(line);
                if (res.text) {
                    callback(userId, res.text);
                } else if (res.error) {
                    console.error(`Transcriber Error [User ${userId}]:`, res.error);
                }
            } catch (e) {
                // Partial JSON? 
                console.error(`JSON Parse Error [${userId}]:`, e);
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        // Log stderr for debugging
        console.error(`[Transcriber stderr ${userId}]: ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Transcriber process for ${userId} exited with code ${code}`);
    });

    // Handle stream end
    inputStream.on('end', () => {
        // Close stdin to tell python we are done
        pythonProcess.stdin.end();
    });
}

function initModel() {
    // No-op for now, Python script checks model
    const engineName = TRANSCRIPTION_ENGINE === 'whisper' ? 'Faster-Whisper (GPU)' : 'Vosk (CPU)';
    console.log(`Transcription Engine: ${engineName} - Python Subprocess mode ready.`);
}

module.exports = {
    initModel,
    transcribeStream
};
