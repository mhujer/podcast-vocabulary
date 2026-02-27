#!/usr/bin/env python3
"""Transcribe audio using Parakeet TDT 0.6B V3 (ONNX).

Usage: python3 scripts/transcribe.py <input.wav> <output.json>

Output JSON matches whisper-cli format:
  { "transcription": [{ "offsets": { "from": <ms>, "to": <ms> }, "text": " word" }, ...] }
"""

import json
import sys
import time

def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.wav> <output.json>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    print(f"[parakeet] loading model nemo-parakeet-tdt-0.6b-v3 ...")
    import onnx_asr

    model = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3")
    vad = onnx_asr.load_vad("silero")

    ts_model = model.with_vad(vad).with_timestamps()

    print(f"[parakeet] transcribing {input_path} ...")
    start = time.time()

    # Collect word-level entries from all VAD segments
    words = []
    for segment in ts_model.recognize(input_path):
        seg_start = segment.start  # seconds
        if segment.tokens and segment.timestamps:
            for token, ts in zip(segment.tokens, segment.timestamps):
                token_text = token.strip()
                if not token_text:
                    continue
                # timestamps are relative to segment start
                abs_start_ms = int((seg_start + ts) * 1000)
                # Estimate end as start of next token (or segment end for last)
                words.append({
                    "token": token,
                    "start_ms": abs_start_ms,
                })

    # Compute end times (next token start, or +200ms for last token in run)
    transcription = []
    for i, w in enumerate(words):
        if i + 1 < len(words):
            end_ms = words[i + 1]["start_ms"]
        else:
            end_ms = w["start_ms"] + 200
        transcription.append({
            "offsets": {"from": w["start_ms"], "to": end_ms},
            "text": w["token"],
        })

    elapsed = time.time() - start
    print(f"[parakeet] done in {elapsed:.1f}s, {len(transcription)} word tokens")

    with open(output_path, "w") as f:
        json.dump({"transcription": transcription}, f)

    print(f"[parakeet] wrote {output_path}")

if __name__ == "__main__":
    main()
