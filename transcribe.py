import sys
import os
import json
from vosk import Model, KaldiRecognizer

# Point to the model directory
MODEL_PATH = "models/vosk-model-small-en-us-0.15"

if not os.path.exists(MODEL_PATH):
    print(json.dumps({"error": f"Model not found at {MODEL_PATH}"}))
    sys.exit(1)

# Initialize Model
try:
    model = Model(MODEL_PATH)
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)

# Create recognizer - using 16kHz to match model expectations
rec = KaldiRecognizer(model, 16000)

while True:
    data = sys.stdin.buffer.read(4000)
    if len(data) == 0:
        break
    
    if rec.AcceptWaveform(data):
        res = json.loads(rec.Result())
        if res['text']:
            print(json.dumps(res), flush=True)
    else:
        # Partial result (optional to print)
        # res = json.loads(rec.PartialResult())
        pass

# Final result
res = json.loads(rec.FinalResult())
if res['text']:
    print(json.dumps(res), flush=True)
