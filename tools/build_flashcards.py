"""Build data/flashcards.json and data/chapters.json from the chapter notes sources.

Usage: python3 tools/build_flashcards.py NOTES_DIR
NOTES_DIR holds chapter-01-source.txt ... chapter-11-source.txt (## / ### headings, "- " bullets, **bold**).
Every top-level bullet shaped "**term**: definition" in the four reference sections becomes a card;
nested bullets under it are added to the back.
"""
import json, os, re, sys

DECKS = ["Vocabulary", "Ports and Protocols", "Commands and Tools", "Numbers and Documents to Know"]
CARD = re.compile(r"^\*\*(.+?)\*\*:\s*(.+)$")

def parse(path):
    title, cards, h2, h3, cur = None, [], None, None, None
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        m = re.match(r"^(#{2,3}) (.*)$", line)
        if m:
            cur = None
            if len(m.group(1)) == 2:
                if title is None:
                    title = m.group(2)
                h2, h3 = m.group(2), None
            else:
                h3 = m.group(2)
            continue
        if h2 not in DECKS:
            continue
        m = re.match(r"^( *)- (.*)$", line)
        depth, text = len(m.group(1)) // 2, m.group(2)
        if depth == 0:
            c = CARD.match(text)
            if c:
                cur = {"deck": h2, "topic": h3 or h2, "front": c.group(1).replace("**", ""), "back": c.group(2), "more": []}
                cards.append(cur)
            else:
                cur = None
        elif cur is not None:
            cur["more"].append(("  " * (depth - 1)) + text)
    return title, cards

def main(notes_dir):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    chapters, decks = [], {}
    for n in range(1, 12):
        title, cards = parse(os.path.join(notes_dir, f"chapter-{n:02d}-source.txt"))
        name = title.split(": ", 1)[1]
        chapters.append({"n": n, "title": name, "cards": len(cards)})
        decks[str(n)] = cards
    json.dump(chapters, open(os.path.join(root, "data", "chapters.json"), "w"), indent=1)
    json.dump(decks, open(os.path.join(root, "data", "flashcards.json"), "w"), indent=0, ensure_ascii=False)
    for c in chapters:
        print(c)

if __name__ == "__main__":
    main(sys.argv[1])
