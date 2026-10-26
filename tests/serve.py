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

    def send_head(self):
        # Audio seeking needs byte ranges, as GitHub Pages serves them.
        rng = self.headers.get('Range', '')
        path = Path(self.translate_path(self.path))
        if not rng.startswith('bytes=') or not path.is_file():
            return super().send_head()
        size = path.stat().st_size
        start, _, end = rng[6:].partition('-')
        start = int(start or 0); end = min(int(end) if end else size - 1, size - 1)
        if start >= size:
            self.send_error(416); return None
        f = open(path, 'rb'); f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left, self._left = getattr(self, '_left', None), None
        try:
            if left is None:
                return super().copyfile(source, outputfile)
            while left > 0:
                chunk = source.read(min(65536, left))
                if not chunk: break
                outputfile.write(chunk); left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The browser dropped an audio request it no longer needs.

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
