"""Narrate a chapter script with Kokoro and record each line's exact timing in the same pass.

Usage: python3 tools/reader/narrate.py DOCFILE "INTRO" OUT.wav OUT_timing.json
DOCFILE holds STYLE|nest|text lines exported from the chapter's Google Doc. Voice, pauses and pronunciation
fixes match the chapter 1 and 2 narrations. Needs kokoro-onnx with kokoro-v1.0.onnx and voices-v1.0.bin in
the working directory. Master the WAV to MP3 afterwards (see docs/listen-and-read.md).
"""
import json, sys
from pathlib import Path
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
sys.path.insert(0, str(Path(__file__).parent))
from prep import speak

docfile, intro, out_wav, out_json = sys.argv[1:5]
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin"); SR = 24000
pause = {"H1": (0, 1.2), "H2": (1.6, 0.8), "H3": (1.0, 0.45), "B": (0, 0.45)}
items = [("H1", -1, intro)]
for ln in open(docfile, encoding="utf-8"):
    st, nest, t = ln.rstrip("\n").split("|", 2)
    items.append(("H2" if st == "HEADING_2" else "H3" if st == "HEADING_3" else "B", int(nest), t))
parts, rows, t = [], [], 0.0
for kind, nest, text in items:
    s = speak(text)
    if kind != "B" and not s.endswith((".", ":", "?")): s += "."
    a, _ = k.create(s, voice="am_michael", speed=1.0, lang="en-us")
    pre, post = pause[kind]
    parts += [np.zeros(int(pre * SR), np.float32), a.astype(np.float32), np.zeros(int(post * SR), np.float32)]
    start = t + int(pre * SR) / SR; end = start + len(a) / SR
    if kind != "H1":
        rows.append({"kind": kind, "nest": nest, "text": text, "spoken": s, "start": round(start, 3), "end": round(end, 3)})
    t = end + int(post * SR) / SR
sf.write(out_wav, np.concatenate(parts), SR)
# timing.py's convention: times exclude the spoken title, whose length build_reader.py measures from the MP3.
title = rows[0]["start"] - pause[rows[0]["kind"]][0]
for r in rows: r["start"] = round(r["start"] - title, 3); r["end"] = round(r["end"] - title, 3)
json.dump({"total": round(t - title, 3), "lines": rows}, open(out_json, "w"), indent=0)
print(out_wav, round(t / 60, 1), "min")
