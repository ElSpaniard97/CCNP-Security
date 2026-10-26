"""Static test server supporting both root and GitHub Pages project paths."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parents[1]), **kwargs)

    def translate_path(self, path):
        if path.startswith('/CCNP-Security/'):
            path = path[len('/CCNP-Security'):]
        return super().translate_path(path)

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
