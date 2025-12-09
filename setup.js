const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m"
};

function log(msg, color = colors.reset) {
    console.log(`${color}${msg}${colors.reset}`);
}

function checkCommand(cmd) {
    try {
        execSync(`which ${cmd}`, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

async function ask(question, defaultVal) {
    return new Promise((resolve) => {
        const q = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
        rl.question(q, (answer) => {
            resolve(answer.trim() || defaultVal);
        });
    });
}

async function main() {
    console.clear();
    log("=== Mina Bot Setup ===", colors.bright + colors.cyan);
    log("This script will help you configure the bot and install dependencies.\n");

    // 0. Check Prerequisites
    log("0. Checking Prerequisites...", colors.yellow);
    const osType = process.platform;
    const isWin = osType === 'win32';
    const isLinux = osType === 'linux';
    
    // Check Node.js
    if (!checkCommand('node')) {
        log("❌ Node.js not found! Please install Node.js 18+ first.", colors.red);
        if (isLinux) {
            log("Install with: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs", colors.cyan);
        }
        process.exit(1);
    } else {
        const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
        log(`✔ Node.js ${nodeVersion} found.`, colors.green);
    }

    // Check FFmpeg
    if (!checkCommand('ffmpeg')) {
        log("❌ FFmpeg not found! Installing FFmpeg...", colors.yellow);
        if (isLinux) {
            try {
                log("Installing FFmpeg via apt...", colors.cyan);
                execSync('sudo apt-get update && sudo apt-get install -y ffmpeg', { stdio: 'inherit' });
                log("✔ FFmpeg installed.", colors.green);
            } catch (e) {
                log("❌ Failed to install FFmpeg. Please install manually.", colors.red);
            }
        } else if (isWin) {
            log("Please download and install FFmpeg from https://ffmpeg.org/download.html", colors.red);
        }
    } else {
        log("✔ FFmpeg found.", colors.green);
    }

    // Check Python
    const pythonCmd = isWin ? 'python' : 'python3';
    if (!checkCommand(pythonCmd)) {
        log("❌ Python not found! Please install Python 3.10+ first.", colors.red);
        process.exit(1);
    } else {
        const pyVersion = execSync(`${pythonCmd} --version`, { encoding: 'utf8' }).trim();
        log(`✔ ${pyVersion} found.`, colors.green);
    }
    log("");

    // 1. Create .env
    if (!fs.existsSync('.env')) {
        log("1. Configuration (.env)", colors.yellow);
        const token = await ask("Discord Bot Token");
        const admin = await ask("Admin User ID");
        const aiProvider = await ask("AI Provider (gemini/openrouter)", "openrouter");
        const aiKey = await ask("AI API Key");

        // Write .env
        let envContent = fs.readFileSync('.env.example', 'utf8');
        envContent = envContent.replace('your_token_here', token);
        envContent = envContent.replace('123456789,987654321', admin);
        envContent = envContent.replace('AI_PROVIDER=openrouter', `AI_PROVIDER=${aiProvider}`);
        envContent = envContent.replace('your_openrouter_key', aiKey);

        fs.writeFileSync('.env', envContent);
        log("✔ .env created.", colors.green);
    } else {
        log("✔ .env already exists. Skipping.", colors.green);
    }

    // 2. AI Config
    if (!fs.existsSync('ai_config.txt')) {
        log("\n2. AI Persona", colors.yellow);
        fs.copyFileSync('ai_config.example.txt', 'ai_config.txt');
        log("✔ Created ai_config.txt from template.", colors.green);
    }

    // 3. Settings
    if (!fs.existsSync('settings.json')) {
        const settings = {
            triggerWords: ['mina', 'nina', 'tina'],
            aiEnabled: true,
            globalVoice: 'en-US'
        };
        fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
        log("✔ Created default settings.json.", colors.green);
    }

    // 4. Node Dependencies
    log("\n3. Installing Node.js Dependencies...", colors.yellow);
    try {
        execSync('npm install', { stdio: 'inherit' });
        log("✔ Node modules installed.", colors.green);
    } catch (e) {
        log("❌ Failed to install node modules.", colors.red);
    }

    // 5. Python Environment
    log("\n4. Setting up Python Environment (for Vosk & Satellite)...", colors.yellow);
    const pythonCmd = isWin ? 'python' : 'python3';

    try {
        // Install python venv package if needed (Linux)
        if (isLinux && !fs.existsSync('venv')) {
            try {
                log("Installing python3-venv package...", colors.cyan);
                execSync('sudo apt-get install -y python3-venv python3-pip build-essential python3-dev', { stdio: 'inherit' });
            } catch (e) {
                log("Note: Could not auto-install python3-venv. Trying to continue...", colors.yellow);
            }
        }

        // Create venv
        if (!fs.existsSync('venv')) {
            log("Creating virtual environment...");
            execSync(`${pythonCmd} -m venv venv`, { stdio: 'inherit' });
        }

        // Install Requirements
        const pipCmd = isWin ? 'venv\\Scripts\\pip' : './venv/bin/pip';
        log("Installing Python dependencies (vosk, sounddevice, python-socketio, pyautogui)...");

        // Ensure pip is upgraded
        execSync(`${pipCmd} install --upgrade pip`, { stdio: 'inherit' });

        // Install deps (removed winsdk for Linux compatibility)
        const pkgs = isWin 
            ? "vosk sounddevice python-socketio[client] pyautogui winsdk edge-tts gTTS"
            : "vosk sounddevice python-socketio[client] pyautogui edge-tts gTTS";
        execSync(`${pipCmd} install ${pkgs}`, { stdio: 'inherit' });

        log("✔ Python environment ready.", colors.green);

    } catch (e) {
        log("❌ Failed to setup Python environment.", colors.red);
        console.error(e.message);
    }

    // 6. Check/Download Vosk Model
    log("\n5. Checking Vosk Speech Model...", colors.yellow);
    const modelPath = path.join(__dirname, 'models', 'vosk-model-small-en-us-0.15');
    if (!fs.existsSync(modelPath)) {
        log("Vosk model not found. Downloading...", colors.cyan);
        try {
            if (!fs.existsSync('models')) {
                fs.mkdirSync('models');
            }
            const modelUrl = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';
            log("Downloading model (this may take a few minutes)...", colors.cyan);
            execSync(`curl -L -o models/model.zip ${modelUrl}`, { stdio: 'inherit' });
            log("Extracting model...", colors.cyan);
            execSync(`cd models && unzip -q model.zip && rm model.zip`, { stdio: 'inherit' });
            log("✔ Vosk model downloaded.", colors.green);
        } catch (e) {
            log("❌ Failed to download model. You may need to download manually from:", colors.red);
            log("https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip", colors.cyan);
        }
    } else {
        log("✔ Vosk model found.", colors.green);
    }

    // 7. Deploy Commands
    log("\n6. Deploying Discord Commands...", colors.yellow);
    if (fs.existsSync('.env')) {
        try {
            execSync('node deploy-commands.js', { stdio: 'inherit' });
            log("✔ Discord commands deployed.", colors.green);
        } catch (e) {
            log("Note: Commands will be deployed on first bot startup.", colors.yellow);
        }
    } else {
        log("Skipping (no .env file yet). Run 'node deploy-commands.js' after configuring .env", colors.yellow);
    }

    // Create helper scripts
    if (isWin) {
        fs.writeFileSync('start_bot.bat', '@echo off\nnode index.js');
        fs.writeFileSync('start_client.bat', '@echo off\ncall venv\\Scripts\\activate\npython satellite/client.py');
        log(`✔ Created start_bot.bat and start_client.bat`, colors.green);
    } else if (isLinux) {
        fs.writeFileSync('start_bot.sh', '#!/bin/bash\nnode index.js\n');
        fs.writeFileSync('start_client.sh', '#!/bin/bash\nsource venv/bin/activate\npython3 satellite/client.py\n');
        execSync('chmod +x start_bot.sh start_client.sh');
        log(`✔ Created start_bot.sh and start_client.sh`, colors.green);
    }

    log("\n=== Setup Complete! ===", colors.bright + colors.green);
    log("Run 'node index.js' (or './start_bot.sh' on Linux) to start the bot.", colors.cyan);

    rl.close();
}

main();
