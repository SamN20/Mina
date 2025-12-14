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
    : path.join(process.cwd(), 'venv', 'bin', 'python3');

console.log(`Transcription Engine: ${TRANSCRIPTION_ENGINE.toUpperCase()} (${PYTHON_SCRIPT})`);

// Track active Python processes for cleanup
const activeProcesses = new Map(); // userId -> pythonProcess

// Function to handle a PCM stream
function transcribeStream(inputStream, userId, callback, model = null) {
    // Spawn python process
    // python transcribe.py
    // Stdin: PCM data
    // Stdout: JSON lines

    const env = { ...process.env };
    if (model) env.WHISPER_MODEL = model;

    // Kill any existing process for this user (cleanup orphaned processes)
    if (activeProcesses.has(userId)) {
        const oldProcess = activeProcesses.get(userId);
        try {
            oldProcess.kill('SIGKILL');
        } catch (e) { }
        activeProcesses.delete(userId);
    }

    const pythonProcess = spawn(PYTHON_CMD, [PYTHON_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env  // Pass environment variables to subprocess
    });

    // Store process reference for cleanup
    activeProcesses.set(userId, pythonProcess);

    // Set a timeout to kill stuck processes (5 minutes max)
    const processTimeout = setTimeout(() => {
        console.log(`[Transcriber] Process timeout for ${userId}, killing...`);
        try {
            pythonProcess.kill('SIGKILL');
        } catch (e) { }
        activeProcesses.delete(userId);
    }, 5 * 60 * 1000);

    pythonProcess.on('error', (err) => {
        console.error(`timestamp: ${Date.now()} - Failed to spawn python process for user ${userId}:`, err);
        clearTimeout(processTimeout);
        activeProcesses.delete(userId);
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
        clearTimeout(processTimeout);
        activeProcesses.delete(userId);
    });

    // Handle stream end
    inputStream.on('end', () => {
        // Close stdin to tell python we are done
        try {
            pythonProcess.stdin.end();
        } catch (e) {
            console.error(`[Transcriber] Error ending stdin for ${userId}:`, e);
        }
    });

    // Return process reference so it can be killed externally if needed
    return pythonProcess;
}

function initModel() {
    // No-op for now, Python script checks model
    const engineName = TRANSCRIPTION_ENGINE === 'whisper' ? 'Faster-Whisper (GPU)' : 'Vosk (CPU)';
    console.log(`Transcription Engine: ${engineName} - Python Subprocess mode ready.`);
}

function killProcess(userId) {
    if (activeProcesses.has(userId)) {
        const process = activeProcesses.get(userId);
        try {
            process.kill('SIGKILL');
            console.log(`[Transcriber] Killed process for ${userId}`);
        } catch (e) {
            console.error(`[Transcriber] Error killing process for ${userId}:`, e);
        }
        activeProcesses.delete(userId);
    }
}

function killAllProcesses() {
    console.log(`[Transcriber] Killing ${activeProcesses.size} active processes...`);
    for (const [userId, process] of activeProcesses.entries()) {
        try {
            process.kill('SIGKILL');
        } catch (e) { }
    }
    activeProcesses.clear();
}

module.exports = {
    initModel,
    transcribeStream,
    killProcess,
    killAllProcesses
};
