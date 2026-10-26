"""Loopback-only HTTP delivery. Does not read tokens or call Kaiten."""
import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote, quote
from .model import normalize_card


STATIC = Path(__file__).parent / 'web'


def make_handler(repository):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def headers_common(self):
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")

        def send_json(self, data, status=200):
            body = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.headers_common()
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def send_file(self, path, name=None, asset=False, attachment=False):
            total = path.stat().st_size
            start, end, partial = 0, total - 1, False
            byte_range = self.headers.get('Range')
            if asset and byte_range:
                match = re.fullmatch(r'bytes=(\d*)-(\d*)', byte_range)
                if not match or not any(match.groups()):
                    self.send_json({'error': 'Неверный диапазон'}, 416)
                    return
                a, b = match.groups()
                if a:
                    start = int(a)
                    end = min(int(b), end) if b else end
                else:
                    start = max(0, total - int(b))
                if start > end or start >= total:
                    self.send_response(416)
                    self.send_header('Content-Range', f'bytes */{total}')
                    self.end_headers()
                    return
                partial = True
            mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
            if path.suffix == '.js':
                mime = 'text/javascript'
            self.send_response(206 if partial else 200)
            self.headers_common()
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(max(0, end - start + 1)))
            if asset:
                self.send_header('Accept-Ranges', 'bytes')
                # HTML/SVG uploads cannot execute as a document on the viewer origin.
                inline = mime.startswith(('image/', 'video/', 'audio/')) or mime == 'application/pdf'
                disposition = 'attachment' if attachment or not inline or mime == 'image/svg+xml' else 'inline'
                self.send_header('Content-Disposition', f"{disposition}; filename*=UTF-8''{quote(name or path.name, safe='')}")
            if partial:
                self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
            self.end_headers()
            with path.open('rb') as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    data = f.read(min(1024 * 1024, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)

        def do_GET(self):
            # Reject arbitrary Host values to avoid DNS rebinding into local data.
            if self.headers.get('Host', '').split(':')[0] not in ('127.0.0.1', 'localhost'):
                self.send_json({'error': 'Доступ разрешён только локально'}, 403)
                return
            u = urlsplit(self.path)
            path, query = unquote(u.path), parse_qs(u.query)
            snapshot = query.get('snapshot', [''])[0]
            try:
                if path == '/api/snapshots':
                    return self.send_json(repository.snapshots())
                if path == '/api/cards':
                    offset = max(0, int(query.get('offset', ['0'])[0]))
                    limit = min(100, max(1, int(query.get('limit', ['40'])[0])))
                    return self.send_json(repository.search(snapshot, query.get('q', [''])[0], offset, limit))
                if re.fullmatch(r'/api/cards/[1-9][0-9]*', path):
                    cid = int(path.rsplit('/', 1)[1])
                    bundle = repository.load_card(snapshot, cid)
                    return self.send_json(normalize_card(bundle, repository.dictionaries(snapshot)))
                match = re.fullmatch(r'/assets/([^/]+)/([1-9][0-9]*)/(\d+)', path)
                if match:
                    file, name = repository.asset_path(match[1], int(match[2]), int(match[3]))
                    return self.send_file(file, name, asset=True, attachment='download' in query)
                names = {'/': 'index.html', '/app.js': 'app.js', '/card-component.js': 'card-component.js',
                         '/rich-text.js': 'rich-text.js', '/styles.css': 'styles.css'}
                if path in names:
                    return self.send_file(STATIC / names[path])
                return self.send_json({'error': 'Страница не найдена'}, 404)
            except FileNotFoundError as e:
                self.send_json({'error': str(e)}, 404)
            except (ValueError, TypeError, KeyError, IndexError):
                self.send_json({'error': 'Не удалось прочитать данные или неверные параметры'}, 400)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except OSError:
                self.send_json({'error': 'Не удалось прочитать файл на диске'}, 500)
    return Handler


def create_server(repository, port=8765):
    return ThreadingHTTPServer(('127.0.0.1', port), make_handler(repository))
