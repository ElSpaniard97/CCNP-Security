"""Build data/reader/chNN.json for the read-along reader from a chapter's line timings.

Usage: python3 tools/reader/build_reader.py N AUDIO.mp3
Reads tools/reader/chNN_timing.json, written by timing.py, which re-synthesizes each line of the
chapter's narration script with the same voice and pauses as the MP3 to get exact line start and end
times. The MP3 also opens with a spoken title that the script doesn't hold, so its length is taken from
the gap between the MP3's duration and the script's total. Word times inside a line are spread by the
length of each word as spoken. Syllables come from pyphen and parts of speech from NLTK's perceptron
tagger (nltk_data taggers/averaged_perceptron_tagger_eng).
"""
import json, re, subprocess, sys
from pathlib import Path
import nltk, pyphen
sys.path.insert(0, str(Path(__file__).parent))
from prep import speak

ROOT = Path(__file__).resolve().parents[2]
POS = {"N": "n", "V": "v", "J": "a", "R": "r"}  # noun, verb, adjective, adverb
hyph = pyphen.Pyphen(lang="en_US")
LEAD = 0.012  # silence Kokoro leaves before the first word

def duration(mp3):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True, check=True)
    return float(out.stdout)

def speech_starts(mp3):
    """Times where speech resumes after a pause, from ffmpeg's silencedetect."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", mp3, "-af", "silencedetect=n=-45dB:d=0.3", "-f", "null", "-"], capture_output=True, text=True)
    return [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out.stderr)]

def snap(lines, starts, offset):
    """Line up each line with the pause before it in the MP3. A narration made from a slightly older script
    or pronunciation list drifts from the re-synthesized timing, so the offset is corrected line by line."""
    moved = []
    for ln in lines:
        guess = ln["start"] + offset
        near = min(starts, key=lambda x: abs(x - guess), default=None)
        if near is not None and abs(near - guess) < 0.8:
            offset = near - LEAD - ln["start"]
            moved.append(abs(near - guess))
        ln["start"] += offset; ln["end"] += offset
    return moved

def words(line):
    tokens = line["text"].split()
    core = [re.sub(r"^\W+|\W+$", "", t) for t in tokens]
    # Headings are title case, which the tagger reads as proper nouns, so tag them in lower case.
    lower = line["kind"] != "B"
    tags = dict(enumerate(t for _, t in nltk.pos_tag([(c.lower() if lower and not c.isupper() else c) or "." for c in core])))
    weight = [len(speak(t)) + 1 for t in tokens]
    span, at, out = line["end"] - line["start"], line["start"], []
    for i, tok in enumerate(tokens):
        w = {"w": tok, "t": round(at, 2)}
        if core[i] and core[i].isalpha() and not core[i].isupper():
            pos = POS.get(tags[i][0]) if not tags[i].startswith("NNP") else None
            if pos: w["p"] = pos
            syl = hyph.inserted(core[i], "·")
            if "·" in syl: w["s"] = tok.replace(core[i], syl, 1)
        out.append(w)
        at += span * weight[i] / sum(weight)
    return out

def main():
    n, mp3 = int(sys.argv[1]), sys.argv[2]
    timing = json.loads((Path(__file__).parent / f"ch{n:02}_timing.json").read_text())
    offset = duration(mp3) - timing["total"]
    timed = [dict(ln) for ln in timing["lines"]]
    moved = snap(timed, speech_starts(mp3), offset)
    lines = []
    for ln in timed:
        lines.append({"k": ln["kind"], "n": max(ln["nest"], 0), "t": round(ln["start"], 2), "e": round(ln["end"], 2), "w": words(ln)})
    chapter = next(c for c in json.loads((ROOT / "data/chapters.json").read_text()) if c["n"] == n)
    out = {"n": n, "title": chapter["title"], "audio": f"audio/ch{n:02}.mp3", "duration": round(duration(mp3), 2), "lines": lines}
    path = ROOT / f"data/reader/ch{n:02}.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(path, f"{len(lines)} lines, title {offset:.2f}s, {len(moved)} lines matched to pauses, largest correction {max(moved, default=0):.2f}s")

if __name__ == "__main__":
    main()
