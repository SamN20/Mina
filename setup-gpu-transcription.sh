#!/bin/bash
# Setup GPU-accelerated transcription with Faster-Whisper

echo "=========================================="
echo "  Faster-Whisper GPU Setup"
echo "=========================================="
echo ""
echo "This will enable GPU-accelerated transcription using your NVIDIA P4000"
echo "Benefits:"
echo "  - Much faster transcription (10-100x faster)"
echo "  - Higher accuracy (Whisper is state-of-the-art)"
echo "  - Better handling of accents, noise, and multiple speakers"
echo ""

cd "$(dirname "$0")"

# Check if NVIDIA GPU is available
if ! command -v nvidia-smi &> /dev/null; then
    echo "❌ ERROR: nvidia-smi not found"
    echo "Please install NVIDIA drivers first"
    exit 1
fi

echo "✓ NVIDIA GPU detected:"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
echo ""

# Activate virtual environment
if [ ! -d "venv" ]; then
    echo "❌ ERROR: Virtual environment not found"
    echo "Please run setup.js first"
    exit 1
fi

source venv/bin/activate

# Install CUDA toolkit dependencies
echo "Installing CUDA dependencies..."
pip install --upgrade pip

# Install PyTorch with CUDA support
echo ""
echo "Installing PyTorch with CUDA 11.8 support..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install Faster-Whisper
echo ""
echo "Installing Faster-Whisper..."
pip install faster-whisper

# Test CUDA availability
echo ""
echo "Testing CUDA availability..."
python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ GPU transcription setup complete!"
    echo ""
    echo "To use GPU transcription, add this to your .env file:"
    echo ""
    echo "TRANSCRIPTION_ENGINE=whisper"
    echo "WHISPER_MODEL=base.en"
    echo ""
    echo "Available models (larger = more accurate but slower):"
    echo "  - tiny.en   (39M params, fastest)"
    echo "  - base.en   (74M params, recommended)"
    echo "  - small.en  (244M params, very accurate)"
    echo "  - medium.en (769M params, best accuracy)"
    echo ""
    echo "Then restart Mina: systemctl restart mina"
else
    echo ""
    echo "❌ CUDA test failed. Please check your NVIDIA driver installation."
    exit 1
fi
