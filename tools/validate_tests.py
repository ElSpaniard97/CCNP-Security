"""Check data/tests/chNN.json files: 5 tests x 20 questions, 4 choices, an explanation for every choice.

Usage: python3 tools/validate_tests.py [N ...]   (default: every chapter file present)
"""
import glob, json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANNED = re.compile(r"\b(all|none|both) of the (above|following)\b|\b[A-D] and [A-D]\b", re.I)

def check(path):
    errs = []
    d = json.load(open(path, encoding="utf-8"))
    tests = d.get("tests", [])
    if len(tests) != 5:
        errs.append(f"expected 5 tests, found {len(tests)}")
    seen, answers = {}, Counter()
    for ti, t in enumerate(tests, 1):
        qs = t.get("questions", [])
        if len(qs) != 20:
            errs.append(f"test {ti}: expected 20 questions, found {len(qs)}")
        for qi, q in enumerate(qs, 1):
            where = f"test {ti} q{qi}"
            text = (q.get("q") or "").strip()
            if len(text) < 15:
                errs.append(f"{where}: question text missing or too short")
            key = re.sub(r"\W+", " ", text.lower()).strip()
            if key in seen:
                errs.append(f"{where}: duplicate of {seen[key]}")
            seen[key] = where
            ch = q.get("choices", [])
            if len(ch) != 4:
                errs.append(f"{where}: expected 4 choices, found {len(ch)}")
                continue
            a = q.get("answer")
            if a not in (0, 1, 2, 3):
                errs.append(f"{where}: answer must be 0-3")
                continue
            answers[a] += 1
            texts = []
            for ci, c in enumerate(ch):
                t_ = (c.get("text") or "").strip()
                w = (c.get("why") or "").strip()
                if not t_:
                    errs.append(f"{where} choice {ci}: empty text")
                if len(w) < 20:
                    errs.append(f"{where} choice {ci}: 'why' missing or too short")
                if BANNED.search(t_):
                    errs.append(f"{where} choice {ci}: choices are shuffled, so don't use '{BANNED.search(t_).group(0)}'")
                texts.append(t_.lower())
            if len(set(texts)) != 4:
                errs.append(f"{where}: duplicate choices")
    total = sum(answers.values())
    return errs, total, answers

def main(ns):
    files = [os.path.join(ROOT, "data", "tests", f"ch{int(n):02d}.json") for n in ns] if ns else sorted(glob.glob(os.path.join(ROOT, "data", "tests", "ch*.json")))
    bad = 0
    for f in files:
        try:
            errs, total, answers = check(f)
        except Exception as e:
            errs, total, answers = [f"cannot read: {e}"], 0, Counter()
        print(f"{os.path.basename(f)}: {total} questions, answer positions {dict(sorted(answers.items()))}, {len(errs)} problems")
        for e in errs[:40]:
            print("  -", e)
        bad += bool(errs)
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main(sys.argv[1:])
