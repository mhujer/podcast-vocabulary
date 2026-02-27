#!/usr/bin/env python3
"""Pre-download the Parakeet TDT 0.6B V3 model and Silero VAD.

Expects HF_HOME to be set (e.g. /podcast-vocabulary/data/parakeet) so models
are cached on the persistent Docker volume.
"""

import os
import time
import onnx_asr

print(f"[parakeet] HF_HOME={os.environ.get('HF_HOME', '(not set)')}")

print("[parakeet] downloading nemo-parakeet-tdt-0.6b-v3 model...")
t0 = time.time()
onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3")
elapsed = time.time() - t0
cached_note = " (likely cached)" if elapsed < 1.0 else ""
print(f"[parakeet] ASR model ready in {elapsed:.1f}s{cached_note}")

print("[parakeet] downloading silero VAD model...")
t0 = time.time()
onnx_asr.load_vad("silero")
elapsed = time.time() - t0
cached_note = " (likely cached)" if elapsed < 1.0 else ""
print(f"[parakeet] VAD model ready in {elapsed:.1f}s{cached_note}")

print("[parakeet] models ready")
