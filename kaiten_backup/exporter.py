import json
import html
from datetime import datetime, timezone
from pathlib import Path
from .catalog import CARD, BOARD, FULL
from .client import BackupError
from .files import FileExporter
from .storage import atomic_json


class Exporter:
    def __init__(self, client, store, cfg, selected, card_ids=None, limit=None):
        self.client, self.store, self.cfg = client, store, cfg
        self.selected = set(selected)
        self.card_ids, self.limit = card_ids, limit
        self.errors = []
        self.card_count = 0
        self.file_count = 0
        self.refs = set()
        self.started = datetime.now(timezone.utc).isoformat()
        self.files = FileExporter(client, store, cfg['backup'], self.issue)

    def issue(self, task, message):
        self.errors.append({'task': task, 'message': message})
        print(f'  [!] {task}: {message}', flush=True)

    def task(self, key, relative, function):
        try:
            return self.store.json(key, relative, function)
        except (BackupError, OSError, ValueError, KeyError, TypeError) as e:
            # Never dump HTTP exception bodies, URLs, or the config with secrets.
            message = str(e) if isinstance(e, BackupError) else f'Ошибка данных/диска ({type(e).__name__})'
            self.issue(key, message)
            return None

    def endpoint(self, e, **params):
        return self.client.fetch(e.path.format(**params), e.mode)

    def board_data(self):
        bid = self.cfg['kaiten']['board_id']
        result = {}
        for name in sorted(self.selected & BOARD.keys()):
            e = BOARD[name]
            print(f'Справочник: {name}', flush=True)
            def fetch(e=e, name=name):
                if name == 'lanes':
                    return sum((self.client.fetch(e.path.format(board_id=bid),
                                                 params={'condition': condition})
                                for condition in (1, 2)), [])
                if name == 'users':
                    return self.client.fetch(e.path, e.mode, {'include_inactive': 'true'})
                return self.endpoint(e, board_id=bid)
            result[name] = self.task(name, f'board/{name}.json', fetch)
        for column in result.get('columns') or []:
            colid = column['id']
            self.task(f'subcolumns:{colid}', f'board/subcolumns_{colid}.json',
                      lambda colid=colid: self.client.fetch(f'/columns/{colid}/subcolumns'))
        for field in result.get('fields') or []:
            kind = field.get('type')
            suffix = {'select': 'select-values', 'catalog': 'catalog-values'}.get(kind)
            if suffix:
                pid = field['id']
                self.task(f'field-values:{pid}', f'board/field_values_{pid}.json',
                          lambda pid=pid, suffix=suffix: self.client.fetch(
                              f'/company/custom-properties/{pid}/{suffix}', 'offset'))
        return result

    def discover(self):
        if self.card_ids:
            return [{'id': cid} for cid in self.card_ids]
        result = []
        bid = self.cfg['kaiten']['board_id']
        for condition in ([1, 2] if self.cfg['backup']['include_archived'] else [1]):
            cards = self.task(f'card-list:{condition}', f'board/cards_{condition}.json',
                              lambda condition=condition: self.client.fetch('/cards', 'offset', {
                                  'board_id': bid, 'condition': condition, 'version': 1,
                                  'order_by': 'id', 'order_direction': 'asc',
                                  'additional_card_fields': 'description', 'broken_api': 'false'}))
            if cards is not None:
                result.extend(cards)
        # Deduplicate cards moved during enumeration.
        return list({c['id']: c for c in result}.values())

    def card(self, cid, fields):
        folder = f'cards/{cid}'
        card = self.task(f'card:{cid}', f'{folder}/card.json',
                         lambda: self.client.fetch(f'/cards/{cid}', params={'broken_api': 'false'}))
        if card is None:
            return set()
        self.card_count += 1
        datasets = {}
        for name in sorted(self.selected & CARD.keys()):
            e = CARD[name]
            def fetch(e=e, name=name):
                if name == 'iterations' and not card.get('uid'):
                    raise BackupError('Нет UID карточки для истории итераций')
                path = e.path.format(card_id=cid, card_uid=card.get('uid'))
                return self.client.fetch(path, e.mode, {'card_id': cid} if name == 'activity' else None)
            datasets[name] = self.task(f'{name}:{cid}', f'{folder}/{name}.json', fetch)
        if 'checklists' in self.selected:
            checklists = []
            for check in card.get('checklists') or []:
                chid = check.get('id') or check.get('checklist_id')
                value = self.task(f'checklist:{cid}:{chid}', f'{folder}/checklist_{chid}.json',
                                  lambda chid=chid: self.client.fetch(f'/cards/{cid}/checklists/{chid}'))
                if value is not None:
                    checklists.append(value)
            datasets['checklists'] = checklists
        if 'files' in self.selected:
            entries = self.files.export(card, datasets, fields)
            atomic_json(self.store.root / folder / 'files.json', entries)
            self.file_count += sum(e['status'] == 'saved' for e in entries)
        else:
            entries = []
        self.render_card(card, datasets, entries)
        refs = set()
        for key in ('parents_ids', 'children_ids'):
            refs.update(card.get(key) or [])
        for child in datasets.get('children') or []:
            refs.add(child['id'])
        for blocker in datasets.get('blockers') or []:
            if blocker.get('blocker_card_id'):
                refs.add(blocker['blocker_card_id'])
        return {int(x) for x in refs if str(x).isdigit()}

    def render_card(self, card, datasets, files):
        esc = html.escape
        title = esc(str(card.get('title', '')))
        body = f'<h1>#{card["id"]} {title}</h1>'
        body += '<h2>Описание</h2><pre>' + esc(card.get('description') or '') + '</pre>'
        for name in ('checklists', 'comments', 'members', 'history', 'activity'):
            if datasets.get(name) is not None:
                body += f'<details><summary>{esc(name)}</summary><pre>'
                body += esc(json.dumps(datasets[name], ensure_ascii=False, indent=2)) + '</pre></details>'
        body += '<h2>Файлы</h2>'
        for f in files:
            if f['status'] == 'saved':
                from urllib.parse import quote
                local = Path(f['path']).name
                href = 'files/' + quote(local)
                body += f'<p><a href="{href}">{esc(f["name"])}</a></p>'
                if local.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp')):
                    body += f'<img loading="lazy" src="{href}" alt="{esc(f["name"])}">'
            else:
                body += f'<p>{esc(f["name"])}: {esc(f["status"])}</p>'
        body += '<p><a href="card.json">Исходные данные карточки</a></p>'
        doc = ('<!doctype html><html lang="ru"><meta charset="utf-8">'
               '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' data:; style-src \'unsafe-inline\'">'
               f'<title>{title}</title><style>body{{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px}}'
               'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:16px}'
               'img{max-width:100%;max-height:700px}summary{cursor:pointer;padding:12px}</style>' + body + '</html>')
        (self.store.root / f'cards/{card["id"]}/index.html').write_text(doc, encoding='utf-8')

    def report(self, status):
        report = {
            'status': status, 'started_at': self.started,
            'finished_at': datetime.now(timezone.utc).isoformat(),
            'origin': self.cfg['kaiten']['origin'], 'board_id': self.cfg['kaiten']['board_id'],
            'selected': sorted(self.selected), 'cards_saved': self.card_count,
            'files_saved': self.file_count, 'requests_this_run': self.client.requests,
            'restricted_to_card_ids': self.card_ids, 'card_limit': self.limit,
            'include_archived': self.cfg['backup']['include_archived'],
            'follow_related': self.cfg['backup']['follow_related'],
            'related_card_ids_not_exported': sorted(self.refs), 'issues': self.errors,
            'note': 'Копия доступных API-данных; не атомарный снимок и не гарантия восстановления 1:1.'}
        atomic_json(self.store.root / 'report.json', report)
        links = []
        for p in sorted((self.store.root / 'cards').glob('*/index.html')):
            cid = p.parent.name
            links.append(f'<li><a href="cards/{cid}/index.html">Карточка {cid}</a></li>')
        (self.store.root / 'index.html').write_text(
            '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Копия Kaiten</title>'
            '<h1>Копия Kaiten</h1><p>Статус: ' + html.escape(status) + '</p>'
            '<p><a href="report.json">Отчёт проверки</a></p><ul>' + ''.join(links) + '</ul></html>', encoding='utf-8')
        return report

    def run(self):
        self.report('running')
        try:
            info = self.board_data()
            needs_cards = bool(self.selected & (set(CARD) | {'cards', 'files', 'checklists'}))
            queue = self.discover() if needs_cards else []
            if self.limit:
                queue = queue[:self.limit]
            seen, pending = set(), {c['id'] for c in queue}
            index = 0
            related_count = 0
            while index < len(queue):
                cid = queue[index]['id']
                index += 1
                if cid in seen:
                    continue
                seen.add(cid)
                print(f'Карточка {index}/{len(queue)}: {cid}', flush=True)
                refs = self.card(cid, info.get('fields'))
                self.refs.update(refs)
                if self.cfg['backup']['follow_related']:
                    for rid in sorted(refs - pending):
                        if related_count >= self.cfg['backup']['max_related_cards']:
                            self.issue('related-limit', 'Достигнут предел связанных карточек')
                            break
                        if self.limit and len(queue) >= self.limit:
                            break
                        queue.append({'id': rid})
                        pending.add(rid)
                        related_count += 1
            self.refs -= seen
            status = 'partial' if self.errors else 'complete_for_selected_scope'
            if self.limit:
                status = 'limited' if not self.errors else 'partial'
            return self.report(status)
        except KeyboardInterrupt:
            self.report('interrupted')
            raise
        except Exception:
            self.report('failed')
            raise
