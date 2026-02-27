#!/usr/bin/env python3
"""Pre-download the Canary 1B v2 model and Silero VAD.

Expects HF_HOME to be set (e.g. /podcast-vocabulary/data/canary) so models
are cached on the persistent Docker volume.
"""

import os
import time
import onnx_asr

print(f"[canary] HF_HOME={os.environ.get('HF_HOME', '(not set)')}")

print("[canary] downloading nemo-canary-1b-v2 model...")
t0 = time.time()
onnx_asr.load_model("nemo-canary-1b-v2")
elapsed = time.time() - t0
cached_note = " (likely cached)" if elapsed < 1.0 else ""
print(f"[canary] ASR model ready in {elapsed:.1f}s{cached_note}")

print("[canary] downloading silero VAD model...")
t0 = time.time()
onnx_asr.load_vad("silero")
elapsed = time.time() - t0
cached_note = " (likely cached)" if elapsed < 1.0 else ""
print(f"[canary] VAD model ready in {elapsed:.1f}s{cached_note}")

print("[canary] models ready")
