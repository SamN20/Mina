import sys
import os
import torch
import soundfile as sf
import time
import queue
import threading
import numpy as np
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

# 1. Setup Paths
# Current script is in tts/engines/
# VibeVoice repo is in tts/VibeVoice/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '../VibeVoice'))

sys.path.append(REPO_ROOT)

try:
    from vibevoice.modular.modeling_vibevoice_streaming_inference import VibeVoiceStreamingForConditionalGenerationInference
    from vibevoice.processor.vibevoice_streaming_processor import VibeVoiceStreamingProcessor
except ImportError as e:
    print(f"Error importing VibeVoice modules: {e}", file=sys.stderr)
    print(f"sys.path is: {sys.path}", file=sys.stderr)
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: python vibevoice_wrapper.py <output_file> <text>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    input_text = sys.argv[2]
    
    # Configuration
    MODEL_PATH = "microsoft/VibeVoice-Realtime-0.5B" # Will download from HuggingFace
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Locate a voice file
    # We look in tts/VibeVoice/demo/voices/streaming_model
    voices_dir = os.path.join(REPO_ROOT, "demo", "voices", "streaming_model")
    voice_path = None
    
    if os.path.exists(voices_dir):
        # Find first .pt file
        for f in os.listdir(voices_dir):
            if f.endswith(".pt"):
                voice_path = os.path.join(voices_dir, f)
                break
    
    if not voice_path:
        print("Error: No voice preset found in demo/voices/streaming_model", file=sys.stderr)
        # Try to find *any* pt file or fail
        sys.exit(1)

    print(f"Loading model from {MODEL_PATH} on {DEVICE}...", file=sys.stderr)
    
    try:
        # Load Processor
        processor = VibeVoiceStreamingProcessor.from_pretrained(MODEL_PATH)
        
        # Load Model
        # Using float32 for CPU/MPS, bfloat16 for CUDA
        dtype = torch.bfloat16 if DEVICE == "cuda" else torch.float32
        attn = "flash_attention_2" if DEVICE == "cuda" else "sdpa"
        
        try:
             model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                MODEL_PATH,
                torch_dtype=dtype,
                device_map=DEVICE,
                attn_implementation=attn
            )
        except Exception:
            # Fallback for attn
            model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                MODEL_PATH,
                torch_dtype=dtype,
                device_map=DEVICE,
                attn_implementation="sdpa"
            )

        model.eval()
        model.set_ddpm_inference_steps(num_steps=5) # Default from demo

        # Load Voice Prompt
        all_prefilled_outputs = torch.load(voice_path, map_location=DEVICE, weights_only=False)

        # Prepare Input
        inputs = processor.process_input_with_cached_prompt(
            text=input_text,
            cached_prompt=all_prefilled_outputs,
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )
        
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(DEVICE)

        # Generate
        print(f"Generating audio for: {input_text}", file=sys.stderr)
        outputs = model.generate(
            **inputs,
            max_new_tokens=None,
            cfg_scale=1.5,
            tokenizer=processor.tokenizer,
            generation_config={'do_sample': False},
            all_prefilled_outputs=all_prefilled_outputs,
        )
        
        if outputs.speech_outputs and outputs.speech_outputs[0] is not None:
             # Save
             processor.save_audio(outputs.speech_outputs[0], output_path=output_path)
             print(f"Saved to {output_path}", file=sys.stderr)
        else:
            print("No audio output generated", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"Inference Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
