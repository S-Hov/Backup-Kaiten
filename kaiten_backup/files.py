import hashlib
import html
import os
import re
from http.client import IncompleteRead
from urllib.parse import urlsplit, urljoin, unquote
from .client import BackupError


def safe_name(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(name)).strip(' .')
    if not name:
        name = 'file'
    return name[:130]


def walk_files(value, context=None):
    """Yield a file with its owning comment/property context, including nested fields."""
    context = dict(context or {})
    if isinstance(value, list):
        for item in value:
            yield from walk_files(item, context)
    elif isinstance(value, dict):
        if value.get('entity_type') == 'comment' or context.get('is_comment'):
            context['comment_uid'] = value.get('comment_uid') or context.get('comment_uid')
        looks_file = ('name' in value and 'id' in value and
                      ('url' in value or value.get('type') == 11 or
                       value.get('entity_type') in ('card', 'comment', 'custom_property')))
        if looks_file:
            yield value, context
            return
        for key, item in value.items():
            ctx = dict(context)
            if key == 'comments' and isinstance(item, list):
                for comment in item:
                    if isinstance(comment, dict):
                        yield from walk_files(comment, dict(ctx, is_comment=True,
                                                           comment_uid=comment.get('uid')))
                continue
            if key.startswith('id_'):
                ctx['property_id'] = key[3:]
            yield from walk_files(item, ctx)


def text_images(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ('description', 'text') and isinstance(item, str):
                patterns = [r'<img\b[^>]*\bsrc\s*=\s*[\"\']([^\"\']+)',
                            r'!\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)']
                for pattern in patterns:
                    for url in re.findall(pattern, item, flags=re.I):
                        yield html.unescape(url)
            else:
                yield from text_images(item)
    elif isinstance(value, list):
        for item in value:
            yield from text_images(item)


class FileExporter:
    def __init__(self, client, store, cfg, issue):
        self.client, self.store, self.cfg, self.issue = client, store, cfg, issue

    def allowed(self, host):
        host = host.lower()
        return (host == urlsplit(self.client.origin).hostname or
                host == 'kaiten.ru' or host.endswith('.kaiten.ru') or
                host in self.cfg.get('extra_asset_hosts', []))

    def download(self, key, url, relative, allowed=None, expected_size=None):
        cached = self.store.cached(key)
        if cached:
            return self.store.state['completed'][key]
        path = self.store.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(path.suffix + '.part')
        for attempt in range(self.client.p['retries'] + 1):
            try:
                with self.client.open(url, allowed=allowed) as r, part.open('wb') as f:
                    length = r.headers.get('Content-Length')
                    for chunk in iter(lambda: r.read(1024 * 1024), b''):
                        f.write(chunk)
                actual = part.stat().st_size
                if length and actual != int(length):
                    raise BackupError('Размер загрузки не совпадает с Content-Length')
                if expected_size is not None and actual != int(expected_size):
                    raise BackupError('Размер файла отличается от метаданных Kaiten')
                os.replace(part, path)
                self.store.commit(key, path)
                return self.store.state['completed'][key]
            except (OSError, EOFError, IncompleteRead, BackupError) as e:
                if attempt == self.client.p['retries']:
                    raise BackupError('Не удалось полностью скачать файл') from None
                self.client.retry_delay({}, attempt)

    def export(self, card, datasets, fields):
        cid = card['id']
        documents = dict(datasets, card=card)
        field_uids = {str(f['id']): f.get('uid') for f in fields or []}
        comments = datasets.get('comments') or []
        comment_uids = {str(c['id']): c.get('uid') for c in comments}
        entries, seen = [], set()
        for file, context in walk_files(documents):
            fid = str(file['id'])
            if file.get('deleted'):
                continue
            if fid in seen:
                continue
            seen.add(fid)
            key = f'file:{cid}:{fid}'
            entry = {'id': fid, 'name': file['name'], 'status': 'failed'}
            try:
                url = file.get('url')
                signed = file.get('type') == 11 or bool(file.get('entity_type'))
                if signed:
                    cuid = card.get('uid')
                    if not cuid:
                        raise BackupError('Нет UID карточки для защищённого файла')
                    path = f'/cards/{cuid}'
                    entity = file.get('entity_type', 'card')
                    comment = file.get('comment_uid') or context.get('comment_uid') or comment_uids.get(str(file.get('comment_id')))
                    prop = file.get('custom_property_uid') or field_uids.get(str(context.get('property_id')))
                    if entity == 'comment' or comment or file.get('comment_id'):
                        if not comment:
                            raise BackupError('Нет UID комментария для файла')
                        path += f'/comments/{comment}'
                    elif entity == 'custom_property' or prop:
                        if not prop:
                            raise BackupError('Нет UID пользовательского поля для файла')
                        path += f'/custom-properties/{prop}'
                    metadata, _ = self.client.json(path + f'/files/{fid}')
                    url = metadata.get('url')
                elif file.get('external') or file.get('type') in (2, 3, 4, 5, 6):
                    entry.update(status='external_reference', url=url)
                    self.issue(f'card:{cid}:file:{fid}', 'Внешнее облачное вложение: сохранена ссылка, содержимое не скопировано')
                    entries.append(entry)
                    continue
                if not url:
                    raise BackupError('Нет ссылки на файл')
                url = urljoin(self.client.origin, url)
                rel = f'cards/{cid}/files/{safe_name(fid)}_{safe_name(file["name"])}'
                record = self.download(key, url, rel, None if signed else self.allowed,
                                       file.get('size'))
                entry.update(record, status='saved')
            except (BackupError, ValueError, TypeError) as e:
                self.issue(f'card:{cid}:file:{fid}', str(e))
            entries.append(entry)
        # Embedded images that are not registered as ordinary attachments.
        known_urls = {f.get('url') for f, _ in walk_files(documents)}
        for url in sorted(set(text_images(documents)) - known_urls):
            if url.startswith('data:'):
                continue  # data URLs are already stored inside the JSON/text
            url = urljoin(self.client.origin, url)
            tag = hashlib.sha256(url.encode()).hexdigest()[:20]
            entry = {'id': tag, 'name': 'inline image', 'status': 'failed'}
            try:
                if not self.allowed(urlsplit(url).hostname or ''):
                    raise BackupError('Внешняя картинка: добавьте хост в extra_asset_hosts')
                suffix = safe_name(unquote(urlsplit(url).path.rsplit('/', 1)[-1]) or 'image')
                record = self.download(f'inline:{cid}:{tag}', url,
                                       f'cards/{cid}/files/inline_{tag}_{suffix}', self.allowed)
                entry.update(record, status='saved')
            except BackupError as e:
                self.issue(f'card:{cid}:inline:{tag}', str(e))
            entries.append(entry)
        return entries
