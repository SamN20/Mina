const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';
const MODELS_DIR = path.join(__dirname, 'models');
const ZIP_PATH = path.join(MODELS_DIR, 'model.zip');
const EXTRACT_PATH = MODELS_DIR;

if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR);
}

// Check if model already exists
if (fs.existsSync(path.join(MODELS_DIR, 'vosk-model-small-en-us-0.15'))) {
    console.log('Model already exists. Skipping download.');
    process.exit(0);
}

console.log('Downloading Vosk model...');
const file = fs.createWriteStream(ZIP_PATH);

https.get(MODEL_URL, (response) => {
    response.pipe(file);

    file.on('finish', () => {
        file.close();
        console.log('Download completed. Extracting...');

        // Use tar via command line since it's available on Windows 10+ 1803+
        // "tar -xf model.zip"
        exec(`tar -xf "${ZIP_PATH}" -C "${MODELS_DIR}"`, (err, stdout, stderr) => {
            if (err) {
                console.error('Error extracting model:', err);
                console.log('Please manually extract models/model.zip to models/');
                return;
            }
            console.log('Model extracted successfully.');
            // Cleanup zip
            fs.unlinkSync(ZIP_PATH);
        });
    });
}).on('error', (err) => {
    console.error('Error downloading model:', err);
});
