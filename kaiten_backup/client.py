"""GET-only client; credentials never follow redirects to file storage."""
import json
import time
import random
import socket
from http.client import IncompleteRead
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urljoin


class BackupError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, origin, token, performance):
        self.origin = origin.rstrip('/')
        self.base = self.origin + '/api/v1'
        self.token = token
        self.p = performance
        self.opener = build_opener(NoRedirect())
        self.next_request = 0.0
        self.requests = 0

    def pace(self):
        time.sleep(max(0, self.next_request - time.monotonic()))
        self.next_request = time.monotonic() + max(
            1 / self.p['requests_per_second'], self.p['min_interval_seconds'])

    def retry_delay(self, headers, attempt):
        raw = headers.get('Retry-After')
        delay = None
        if raw:
            try:
                delay = float(raw)
            except ValueError:
                try:
                    delay = (parsedate_to_datetime(raw) - datetime.now(timezone.utc)).total_seconds()
                except (TypeError, ValueError):
                    pass
        if delay is None and headers.get('X-RateLimit-Reset'):
            try:
                delay = float(headers['X-RateLimit-Reset']) - time.time()
            except ValueError:
                pass
        if delay is None:
            delay = self.p['backoff_seconds'] * 2 ** attempt + random.random() * 0.2
        # Do not issue early requests when the server asks for a long pause.
        self.next_request = max(self.next_request, time.monotonic() + max(0, delay))
        time.sleep(min(max(0, delay), self.p['max_backoff_seconds']))

    def open(self, url, authenticated=False, allowed=None):
        for redirect in range(6):
            u = urlsplit(url)
            if u.scheme != 'https' or not u.hostname or u.username or u.password:
                raise BackupError('Небезопасный адрес запроса/перенаправления')
            if allowed and not allowed(u.hostname):
                raise BackupError('Хост файла не разрешён в конфиге')
            if authenticated and f'{u.scheme}://{u.netloc}' != self.origin:
                raise BackupError('Авторизация разрешена только на домене Kaiten')
            for attempt in range(self.p['retries'] + 1):
                self.pace()
                headers = {'User-Agent': 'kaiten-backup/0.1', 'Accept': '*/*'}
                if authenticated:
                    headers['Authorization'] = 'Bearer ' + self.token
                self.requests += 1
                try:
                    return self.opener.open(Request(url, headers=headers, method='GET'),
                                            timeout=self.p['timeout_seconds'])
                except HTTPError as e:
                    status, location, h = e.code, e.headers.get('Location'), e.headers
                    e.close()
                    if status in (301, 302, 303, 307, 308) and location:
                        url = urljoin(url, location)
                        authenticated = False  # never forward bearer, even on same-host redirect
                        break
                    if status in (429, 500, 502, 503, 504) and attempt < self.p['retries']:
                        self.retry_delay(h, attempt)
                        continue
                    raise BackupError(f'HTTP {status}') from None
                except (URLError, TimeoutError, socket.timeout, OSError):
                    if attempt == self.p['retries']:
                        raise BackupError('Сетевая ошибка или таймаут') from None
                    self.retry_delay({}, attempt)
            else:
                raise BackupError('Исчерпаны попытки')
        raise BackupError('Слишком много перенаправлений')

    def json(self, path, params=None):
        url = self.base + path
        if params:
            url += '?' + urlencode(params, doseq=True)
        with self.open(url, authenticated=True) as r:
            headers = dict(r.headers)
            try:
                data = json.load(r)
            except (ValueError, UnicodeError, IncompleteRead, OSError):
                raise BackupError('API вернул не JSON') from None
        return data, headers

    def fetch(self, path, mode='single', params=None):
        params = dict(params or {})
        if mode == 'single':
            return self.json(path, params)[0]
        size = self.p['page_size']
        offset, cursor, seen_pages, result = 0, None, set(), []
        while True:
            q = dict(params, limit=size)
            if mode == 'offset':
                q['offset'] = offset
            elif cursor is not None:
                q['cursor'] = cursor
            data, headers = self.json(path, q)
            if mode == 'cursor':
                if not isinstance(data, dict) or not isinstance(data.get('items'), list) or 'next_cursor' not in data:
                    raise BackupError('Неожиданный формат курсорного списка')
                page = data['items']
            else:
                page = data
                if not isinstance(page, list):
                    raise BackupError('Ожидался JSON-массив; выгрузка остановлена')
            signature = json.dumps(page, sort_keys=True, ensure_ascii=False)
            if page and signature in seen_pages:
                raise BackupError('API повторяет страницу; пагинация не работает')
            seen_pages.add(signature)
            result.extend(page)
            if mode == 'cursor':
                new_cursor = data['next_cursor']
                if new_cursor is None:
                    return result
                if new_cursor == cursor:
                    raise BackupError('API повторяет курсор')
                cursor = new_cursor
            else:
                applied = int(next((v for k, v in headers.items() if k.lower() == 'x-pagination-limit'), size))
                # Some older routes ignore pagination and return all data.
                if len(page) > applied:
                    return result
                if len(page) < applied:
                    return result
                if applied <= 0:
                    raise BackupError('Некорректный лимит страницы API')
                offset += applied
