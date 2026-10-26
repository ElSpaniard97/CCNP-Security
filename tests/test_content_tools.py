import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from section_overrides import apply_overrides
from tag_questions import sections

class ContentTools(unittest.TestCase):
    def test_reviewed_override_and_stale_guard(self):
        data=json.loads((ROOT/'data/tests/ch01.json').read_text())
        q=data['tests'][0]['questions'][0]
        q['section']='Wrong area'
        apply_overrides(data,1)
        self.assertEqual(q['section'],'2. Threats, Vulnerabilities, and Exploits')
        q['q']='Changed question'
        with self.assertRaises(ValueError): apply_overrides(data,1)

    def test_subsections_retain_parent_and_title(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'source.txt'
            p.write_text('## 1. Cryptography\n### Hashing\nSHA-256 verifies integrity.\n### Encryption\nAES is symmetric.\n')
            result=sections(p)
            self.assertEqual([row[:2] for row in result],[('1. Cryptography','Hashing'),('1. Cryptography','Encryption')])

if __name__=='__main__': unittest.main()
