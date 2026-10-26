"""Filesystem adapter. Replace this class with a database repository later."""
import json
import re
from functools import lru_cache
from pathlib import Path


class ArchiveRepository:
    def __init__(self, backups):
        self.root = Path(backups).resolve()

    def snapshot_path(self, name):
        if not name or '/' in name or '\\' in name or name in ('.', '..'):
            raise ValueError('Некорректное имя копии')
        path = (self.root / name).resolve()
        if path.parent != self.root or not (path / 'cards').is_dir():
            raise FileNotFoundError('Копия не найдена')
        return path

    @staticmethod
    def read(path):
        return json.loads(path.read_text(encoding='utf-8-sig'))

    def snapshots(self):
        result = []
        if not self.root.is_dir():
            return result
        for path in sorted(self.root.iterdir(), reverse=True):
            if not path.is_dir() or not (path / 'cards').is_dir():
                continue
            try:
                report = self.read(path / 'report.json')
            except (OSError, ValueError):
                report = {}
            result.append(dict(id=path.name, boardId=report.get('board_id'),
                               date=report.get('finished_at') or report.get('started_at'),
                               cards=report.get('cards_saved'), files=report.get('files_saved'),
                               status=report.get('status', 'unknown'),
                               issues=len(report.get('issues') or [])))
        return result

    def card_path(self, snapshot, card_id):
        if not re.fullmatch(r'[1-9][0-9]*', str(card_id)):
            raise ValueError('Номер карточки должен быть положительным числом')
        path = (self.snapshot_path(snapshot) / 'cards' / str(card_id)).resolve()
        if path.parent != self.snapshot_path(snapshot) / 'cards' or not path.is_dir():
            raise FileNotFoundError('Карточка отсутствует в этой копии')
        return path

    def load_card(self, snapshot, card_id):
        path = self.card_path(snapshot, card_id)
        raw, errors = {}, []
        for file in sorted(path.glob('*.json')):
            try:
                raw[file.name] = self.read(file)
            except (OSError, ValueError):
                errors.append(f'Не удалось прочитать {file.name}')
        if not isinstance(raw.get('card.json'), dict) or 'id' not in raw['card.json']:
            raise FileNotFoundError('Подробные данные карточки не сохранены или повреждены')
        selected = self.report(snapshot).get('selected') or []
        expected = {'comments', 'activity', 'history', 'members', 'children', 'links',
                    'files', 'blockers', 'time-logs', 'iterations', 'baselines', 'sla'}
        for name in sorted(expected & set(selected)):
            if name + '.json' not in raw:
                errors.append(f'Раздел «{name}» не сохранён или не читается')
        errors += self.card_issues(snapshot).get(str(card_id), [])
        return {'raw': raw, 'errors': errors, 'snapshot': snapshot}

    @lru_cache(maxsize=8)
    def report(self, snapshot):
        try:
            return self.read(self.snapshot_path(snapshot) / 'report.json')
        except (OSError, ValueError):
            return {}

    @lru_cache(maxsize=8)
    def card_issues(self, snapshot):
        result = {}
        report = self.report(snapshot)
        for issue in report.get('issues') or []:
            task = issue.get('task', '')
            match = re.search(r'(?:^card:|^[a-z-]+:)(\d+)(?::|$)', task)
            if match:
                result.setdefault(match[1], []).append(issue.get('message', task))
        return result

    @lru_cache(maxsize=8)
    def dictionaries(self, snapshot):
        board = self.snapshot_path(snapshot) / 'board'
        result = {}
        # Card lists are loaded separately and not included in detail responses.
        for file in board.glob('*.json'):
            if file.name.startswith('cards_'):
                continue
            try:
                result[file.stem] = self.read(file)
            except (OSError, ValueError):
                continue
        return result

    @lru_cache(maxsize=8)
    def index(self, snapshot):
        root = self.snapshot_path(snapshot)
        cards = {}
        for name in ('cards_1.json', 'cards_2.json'):
            try:
                data = self.read(root / 'board' / name)
            except (OSError, ValueError):
                continue
            for card in data if isinstance(data, list) else []:
                cid = card.get('id')
                if isinstance(cid, int):
                    cards[cid] = dict(id=cid, title=card.get('title', ''),
                                      archived=bool(card.get('archived')),
                                      columnId=card.get('column_id'),
                                      updated=card.get('updated'))
        # Also includes folders reached via --follow-related or --card-id.
        available = {int(p.name) for p in (root / 'cards').iterdir()
                     if p.is_dir() and p.name.isdecimal()}
        for cid in available:
            cards.setdefault(cid, dict(id=cid, title=f'Карточка {cid}', archived=False))
        return sorted((c for cid, c in cards.items() if cid in available),
                      key=lambda c: c['id'], reverse=True)

    def search(self, snapshot, query='', offset=0, limit=40):
        query = query.strip().lstrip('#').casefold()
        entries = self.index(snapshot)
        matches = [c for c in entries if not query or query in str(c['id']) or query in c['title'].casefold()]
        return {'items': matches[offset:offset + limit], 'total': len(matches),
                'offset': offset, 'limit': limit}

    def asset_path(self, snapshot, card_id, index):
        folder = self.card_path(snapshot, card_id)
        manifest = self.read(folder / 'files.json')
        if index < 0 or index >= len(manifest):
            raise FileNotFoundError('Файл не найден')
        file = manifest[index]
        if file.get('status') != 'saved':
            raise FileNotFoundError('Содержимое этого файла не было скачано')
        path = (self.snapshot_path(snapshot) / file.get('path', '')).resolve()
        if not path.is_relative_to(folder / 'files') or not path.is_file():
            raise FileNotFoundError('Файл отсутствует или путь выходит за папку вложений')
        return path, file.get('name', path.name)
