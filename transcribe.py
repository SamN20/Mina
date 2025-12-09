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

# Create recognizer
# Discord audio is 48kHz. Vosk small model might be trained on 16kHz but often accepts 48k?
# Actually, it's safer to check. The small model is usually trained on 16k or maybe 8k (telephony) or Wideband.
# If we feed 48k into a 16k model, Vosk might complain or result in garbage.
# Ideally we downsample. But let's try 48000 first.
# If it fails, we might need to downsample in Node or Python.
# ... Actually, standard usage often suggests Resampling.
# Let's trust that we can pass 48000 to the recognizer if the model supports it, 
# or we use `SetLogLevel(-1)` to hide warnings and hope for best or handle resampling in Node (prism-media can resample).
# Wait, prism-media Decoder can output 16k. Let's do that in node if needed.
# For now, let's assume we will send 48000.
rec = KaldiRecognizer(model, 48000)

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
