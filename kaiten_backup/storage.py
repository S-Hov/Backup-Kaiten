import hashlib
import json
import os
from pathlib import Path


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, path)


def without_signed_urls(value):
    """Temporary credentials in file URLs have no place in a long-lived archive."""
    if isinstance(value, list):
        return [without_signed_urls(x) for x in value]
    if isinstance(value, dict):
        signed = value.get('type') == 11 or value.get('entity_type') in ('card', 'comment', 'custom_property')
        return {k: without_signed_urls(v) for k, v in value.items()
                if not (signed and k == 'url')}
    return value


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


class Store:
    def __init__(self, root, identity, resume=False):
        self.root = Path(root).resolve()
        self.state_path = self.root / 'state.json'
        if resume:
            self.state = json.loads(self.state_path.read_text(encoding='utf-8'))
            if self.state['identity'] != identity:
                raise ValueError('Параметры --resume отличаются от исходной выгрузки')
        else:
            self.root.mkdir(parents=True, exist_ok=False)
            self.state = {'identity': identity, 'completed': {}}
            atomic_json(self.state_path, self.state)

    def cached(self, key):
        entry = self.state['completed'].get(key)
        if entry:
            path = (self.root / entry['path']).resolve()
            if not path.is_relative_to(self.root):
                raise ValueError('Небезопасный путь в state.json')
            if path.is_file() and digest(path) == entry['sha256']:
                return path
        return None

    def commit(self, key, path):
        path = Path(path)
        self.state['completed'][key] = {
            'path': path.relative_to(self.root).as_posix(),
            'size': path.stat().st_size, 'sha256': digest(path)}
        atomic_json(self.state_path, self.state)

    def json(self, key, relative, function):
        cached = self.cached(key)
        if cached:
            return json.loads(cached.read_text(encoding='utf-8'))
        value = without_signed_urls(function())
        path = self.root / relative
        atomic_json(path, value)
        self.commit(key, path)
        return value
