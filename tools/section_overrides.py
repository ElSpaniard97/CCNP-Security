"""Apply reviewed, zero-based chapter.test.question overrides with text guards."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def apply_overrides(data, n):
    overrides = json.loads((ROOT / 'data/section_overrides.json').read_text())
    for key, entry in overrides.items():
        ch, test, index = map(int, key.split('.'))
        if ch != n:
            continue
        q = data['tests'][test - 1]['questions'][index]
        if q['q'] != entry['question']:
            raise ValueError(f'Stale section override {key}: question text changed')
        q['section'] = entry['section']
    return data

if __name__ == '__main__':
    for path in sorted((ROOT / 'data/tests').glob('ch*.json')):
        n = int(path.stem[2:])
        data = apply_overrides(json.loads(path.read_text()), n)
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
