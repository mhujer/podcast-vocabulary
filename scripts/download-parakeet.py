#!/usr/bin/env python3
"""Pre-download the Parakeet TDT 0.6B V3 model and Silero VAD.

Expects HF_HOME to be set (e.g. /podcast-vocabulary/data/parakeet) so models
are cached on the persistent Docker volume.
"""

import os
import onnx_asr

print(f"[parakeet] HF_HOME={os.environ.get('HF_HOME', '(not set)')}")
print("[parakeet] downloading nemo-parakeet-tdt-0.6b-v3 model...")
onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3")
print("[parakeet] downloading silero VAD model...")
onnx_asr.load_vad("silero")
print("[parakeet] models ready")
