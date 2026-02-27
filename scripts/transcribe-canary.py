#!/usr/bin/env python3
"""Transcribe audio using Canary 1B V2 (ONNX).

Usage: python3 scripts/transcribe-canary.py <input.wav> <output.json>

Output JSON matches whisper-cli format:
  { "transcription": [{ "offsets": { "from": <ms>, "to": <ms> }, "text": " word" }, ...] }
"""

import json
import os
import sys
import time

def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.wav> <output.json>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    # --- Model loading ---
    print(f"[canary] loading ASR model nemo-canary-1b-v2 ...")
    t0 = time.time()
    import onnx_asr
    model = onnx_asr.load_model("nemo-canary-1b-v2")
    print(f"[canary] ASR model loaded in {time.time() - t0:.1f}s")

    t0 = time.time()
    print(f"[canary] loading Silero VAD model ...")
    vad = onnx_asr.load_vad("silero")
    print(f"[canary] VAD model loaded in {time.time() - t0:.1f}s")

    t0 = time.time()
    ts_model = model.with_vad(vad).with_timestamps()
    print(f"[canary] timestamped model ready in {time.time() - t0:.1f}s")

    # --- Input file info ---
    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    print(f"[canary] input file: {input_path} ({file_size_mb:.1f} MB)")

    # --- Transcription ---
    print(f"[canary] transcribing ...")
    start = time.time()

    # Collect word-level entries from all VAD segments
    words = []
    seg_idx = 0
    for segment in ts_model.recognize(input_path):
        seg_start = segment.start  # seconds
        seg_end = segment.end if hasattr(segment, 'end') else None
        num_tokens = len(segment.tokens) if segment.tokens else 0
        end_str = f"{seg_end:.1f}" if seg_end is not None else "?"
        print(f"[canary] segment {seg_idx}: {seg_start:.1f}s\u2013{end_str}s, {num_tokens} tokens")
        seg_idx += 1

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

    # --- Token collection summary ---
    if words:
        span_start_s = words[0]["start_ms"] / 1000
        span_end_s = words[-1]["start_ms"] / 1000
        print(f"[canary] collected {len(words)} words spanning {span_start_s:.1f}s\u2013{span_end_s:.1f}s")
    else:
        print(f"[canary] collected 0 words")

    # --- Compute end times ---
    print(f"[canary] computing end times ...")
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
    print(f"[canary] done in {elapsed:.1f}s, {len(transcription)} word tokens")

    # --- Write output ---
    with open(output_path, "w") as f:
        json.dump({"transcription": transcription}, f)

    out_size_kb = os.path.getsize(output_path) / 1024
    print(f"[canary] wrote {output_path} ({out_size_kb:.1f} KB)")

if __name__ == "__main__":
    main()
