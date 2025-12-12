#!/usr/bin/env python3
"""
GPU-accelerated transcription using Faster-Whisper
Requires: pip install faster-whisper
Uses NVIDIA GPU for fast, accurate transcription
"""
import sys
import os
import json
import numpy as np
from faster_whisper import WhisperModel

# Configuration
MODEL_SIZE = os.getenv('WHISPER_MODEL', 'base.en')  # tiny.en, base.en, small.en, medium.en, large-v2
DEVICE = os.getenv('WHISPER_DEVICE', 'cpu')  # cuda or cpu
# Use int8 for both CPU and GPU (best compatibility)
COMPUTE_TYPE = "int8"

# Initialize model
try:
    print(f"Loading Faster-Whisper model: {MODEL_SIZE} on {DEVICE}...", file=sys.stderr)
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    print("Model loaded successfully!", file=sys.stderr)
except Exception as e:
    # Fallback to CPU if CUDA fails
    if DEVICE == "cuda":
        print(f"GPU failed ({e}), falling back to CPU...", file=sys.stderr)
        DEVICE = "cpu"
        COMPUTE_TYPE = "int8"
        try:
            model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
            print("Model loaded successfully on CPU!", file=sys.stderr)
        except Exception as e2:
            print(json.dumps({"error": f"Failed to load model: {str(e2)}"}))
            sys.exit(1)
    else:
        print(json.dumps({"error": f"Failed to load model: {str(e)}"}))
        sys.exit(1)

# Audio configuration - expecting 16kHz mono PCM from Node.js
SAMPLE_RATE = 16000

audio_buffer = b''

def is_hallucination(text):
    """Detect if transcription is likely a hallucination (repetitive patterns)"""
    if not text or len(text) < 10:
        return False
    
    words = text.lower().split()
    if len(words) < 5:
        return False
    
    # Count word frequency
    word_counts = {}
    for word in words:
        word_counts[word] = word_counts.get(word, 0) + 1
    
    total_words = len(words)
    
    # Check for excessive repetition
    for word, count in word_counts.items():
        # If any word appears more than 40% of the time, it's likely a hallucination
        if count / total_words > 0.4 and count > 3:
            return True
    
    # Check for repetitive phrases (common hallucination patterns)
    hallucination_phrases = [
        'bye bye bye', 'okay okay okay', 'all right all right',
        'next time next time', 'see you see you', 'thank you thank you',
        'yeah yeah yeah', 'no no no', 'yes yes yes'
    ]
    
    text_lower = text.lower()
    for phrase in hallucination_phrases:
        if phrase in text_lower:
            # Count how many times the phrase appears
            count = text_lower.count(phrase)
            if count >= 2:
                return True
    
    return False

def transcribe_audio(audio_data):
    """Transcribe audio data using Faster-Whisper"""
    try:
        # Convert bytes to float32 numpy array
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        
        # Transcribe with better settings for complete sentences
        segments, info = model.transcribe(
            audio_np,
            language="en",
            beam_size=5,
            vad_filter=False,
            word_timestamps=False,
            condition_on_previous_text=True  # Better context for sentence completion
        )
        
        # Collect results
        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())
        
        text = " ".join(text_parts).strip()
        
        # Filter out hallucinations
        if text and is_hallucination(text):
            print(json.dumps({"warning": "Hallucination detected, suppressing output"}), file=sys.stderr)
            return None
        
        if text:
            return {"text": text}
        return None
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return None

# Main loop - buffer all audio until stream ends
while True:
    try:
        # Read audio data in chunks
        data = sys.stdin.buffer.read(4000)
        if len(data) == 0:
            break
        
        audio_buffer += data
                
    except KeyboardInterrupt:
        break
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        break

# Transcribe all buffered audio at once when stream ends
if len(audio_buffer) > SAMPLE_RATE * 2:  # At least 1 second of audio (16-bit = 2 bytes per sample)
    result = transcribe_audio(audio_buffer)
    if result:
        print(json.dumps(result), flush=True)
