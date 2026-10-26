"""Tag every practice test question with the chapter section it tests and the flashcards that cover it.

Usage: python3 tools/tag_questions.py NOTES_DIR [N ...]
NOTES_DIR holds chapter-NN-source.txt. The numbered "## N. Title" sections are the study areas. Each question
(question text, right answer, and its explanation) is matched to the closest "### " subsection by TF-IDF cosine
similarity, and that subsection's section becomes the question's "section". Up to three flashcards whose term
appears in the right answer (or, for multi-word terms, the question or explanation) become its "cards".
Run after the tests or data/flashcards.json change. The results page and dashboard group misses by these fields.
"""
import glob, json, math, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOP = set("""a an and are as at be by can for from has have how in is it its of on or that the this to
use used uses using what when where which who why will with does do not than then these those their there
they you your into over under also more most only such other each both about after before between while
correct answer because chapter""".split())

def words(s):
    s = re.sub(r"\*\*", "", s.lower())
    return [w for w in re.findall(r"[a-z0-9][a-z0-9.+/-]*[a-z0-9]|[a-z0-9]", s) if w not in STOP]

def sections(path):
    """[(section, topic, text)] for every ### subsection under a numbered ## section."""
    out, sec, topic, buf = [], None, None, []
    def flush():
        if sec and buf:
            out.append((sec, topic or sec, " ".join(buf)))
    for line in open(path, encoding="utf-8"):
        m = re.match(r"^(#{2,3}) (.*)$", line.rstrip())
        if m:
            flush(); buf = []
            if len(m.group(1)) == 2:
                sec = m.group(2) if re.match(r"\d+\. ", m.group(2)) else None
                topic = None
            else:
                topic = m.group(2)
            continue
        if sec:
            buf.append(line.strip())
    flush()
    return out

def variants(front):
    """Ways a flashcard term can appear in text: "Server-side request forgery (SSRF)" -> both halves."""
    f = front.replace("**", "")
    m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", f)
    out = {m.group(1)} | {p.strip() for p in re.split(r",| or |/", m.group(2))} if m else {f}
    return {v for v in out if len(v) >= 2}

def found(text, v):
    if v.isupper() or re.search(r"\d", v):
        return re.search(r"(?<![\w-])" + re.escape(v) + r"(?![\w-])", text)
    return re.search(r"(?<![\w-])" + re.escape(v) + r"s?(?![\w-])", text, re.I)

def cards_for(q, cards):
    a = q["choices"][q["answer"]]
    hits = []
    for c in cards:
        vs = variants(c["front"])
        specific = " " in c["front"] or "(" in c["front"] or not c["front"].istitle()
        if any(found(a["text"], v) for v in vs):
            score = 3
        elif specific and any(found(q["q"], v) for v in vs):
            score = 2
        elif specific and any(found(a["why"], v) for v in vs):
            score = 1
        else:
            continue
        hits.append((score, len(c["front"]), c["front"]))
    return [h[2] for h in sorted(hits, reverse=True)[:3]]

def vec(tokens, idf):
    tf = Counter(tokens)
    v = {w: (1 + math.log(c)) * idf.get(w, 0) for w, c in tf.items()}
    n = math.sqrt(sum(x * x for x in v.values())) or 1
    return {w: x / n for w, x in v.items()}

def cos(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(w, 0) for w, x in a.items())

def tag(notes_dir, n, flashcards):
    subs = sections(os.path.join(notes_dir, f"chapter-{n:02d}-source.txt"))
    secs = {}
    for s, t, text in subs:
        secs.setdefault(s, []).append(f"{t} {text}")
    docs = [words(f"{t} {t} {text}") for s, t, text in subs] + [words(" ".join(v)) for v in secs.values()]
    df = Counter(w for d in docs for w in set(d))
    idf = {w: math.log((1 + len(docs)) / (1 + c)) + 1 for w, c in df.items()}
    sub_v = [vec(words(f"{t} {t} {text}"), idf) for s, t, text in subs]
    sec_v = {s: vec(words(" ".join(v)), idf) for s, v in secs.items()}

    path = os.path.join(ROOT, "data", "tests", f"ch{n:02d}.json")
    data = json.load(open(path, encoding="utf-8"))
    counts = Counter()
    for t in data["tests"]:
        for q in t["questions"]:
            a = q["choices"][q["answer"]]
            qv = vec(words(f"{q['q']} {q['q']} {a['text']} {a['text']} {a['why']}"), idf)
            q.pop("topic", None)
            q["cards"] = cards_for(q, flashcards.get(str(n), []))
            best = max(range(len(subs)), key=lambda i: cos(qv, sub_v[i]) + 0.6 * cos(qv, sec_v[subs[i][0]]))
            q["section"] = subs[best][0]
            counts[q["section"]] += 1
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"ch{n:02d}: {sum(bool(q['cards']) for t in data['tests'] for q in t['questions'])} questions linked to flashcards; sections " + ", ".join(f"{s.split('.')[0]}={c}" for s, c in sorted(counts.items(), key=lambda x: int(x[0].split('.')[0]))))

def main(argv):
    if not argv:
        sys.exit(__doc__)
    notes, ns = argv[0], [int(x) for x in argv[1:]]
    if not ns:
        ns = sorted(int(re.search(r"ch(\d+)", p).group(1)) for p in glob.glob(os.path.join(ROOT, "data", "tests", "ch*.json")))
    flashcards = json.load(open(os.path.join(ROOT, "data", "flashcards.json"), encoding="utf-8"))
    for n in ns:
        tag(notes, n, flashcards)

if __name__ == "__main__":
    main(sys.argv[1:])
