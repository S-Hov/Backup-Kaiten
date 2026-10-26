"""Versioned card view model, independent of the archive's folder structure."""
import mimetypes
from pathlib import PurePosixPath
from urllib.parse import quote, urlsplit, unquote


def named(value, default='Не указано'):
    if not isinstance(value, dict):
        return str(value) if value is not None else default
    return value.get('full_name') or value.get('name') or value.get('title') or default


def normalize_card(bundle, dictionaries):
    raw = bundle['raw']
    card = raw['card.json']
    cid, snapshot = card['id'], bundle['snapshot']
    base = f'/assets/{quote(snapshot, safe="")}/{cid}'
    labels = {}
    for group in ('users', 'columns', 'lanes', 'types', 'tags', 'fields'):
        labels[group] = {str(v['id']): v for v in dictionaries.get(group, [])
                         if isinstance(v, dict) and 'id' in v}
    for name, values in dictionaries.items():
        if name.startswith('subcolumns_') and isinstance(values, list):
            labels['columns'].update({str(v['id']): v for v in values})
    for item in [card.get('owner'), *(raw.get('members.json') or card.get('members') or [])]:
        if isinstance(item, dict) and 'id' in item:
            labels['users'][str(item['id'])] = item
    url_map = {}
    files = []
    original_files = {str(f.get('id')): f for f in card.get('files') or []}
    for index, f in enumerate(raw.get('files.json') or []):
        original = original_files.get(str(f.get('id')), {})
        name = f.get('name') or original.get('name') or 'Файл'
        suffix = PurePosixPath(f.get('path') or name).suffix.lower()
        mime = original.get('mime_type') or mimetypes.guess_type('file' + suffix)[0] or 'application/octet-stream'
        local = base + f'/{index}' if f.get('status') == 'saved' else None
        item = dict(id=str(f.get('id')), name=name, size=f.get('size'), mime=mime,
                    image=mime.startswith('image/'), video=mime.startswith('video/'),
                    audio=mime.startswith('audio/'), status=f.get('status'), url=local,
                    downloadUrl=local + '?download=1' if local else None,
                    sha256=f.get('sha256'), commentId=original.get('comment_id'),
                    cover=bool(original.get('card_cover')), originalUrl=original.get('url'))
        files.append(item)
        if local:
            original_url = original.get('url')
            if original_url:
                url_map[original_url] = local
                url_map[urlsplit(original_url).path] = local
            path = f.get('path') or ''
            # Inline downloads include the source basename after an opaque hash.
            filename = PurePosixPath(path).name
            if filename.startswith('inline_') and len(filename.split('_', 2)) == 3:
                url_map['basename:' + filename.split('_', 2)[2]] = local
    # Original metadata that did not get a manifest entry must remain visible.
    recorded = {f['id'] for f in files}
    for fid, f in original_files.items():
        if fid not in recorded and not f.get('deleted'):
            files.append(dict(id=fid, name=f.get('name', 'Файл'), size=f.get('size'),
                              status='not_exported', image=False, url=None,
                              originalUrl=f.get('url')))
    properties = []
    for key, value in (card.get('properties') or {}).items():
        pid = key.removeprefix('id_')
        definition = labels['fields'].get(pid, {})
        values = dictionaries.get(f'field_values_{pid}', [])
        variants = {str(v.get('id')): named(v, str(v.get('value', v.get('id'))))
                    for v in values if isinstance(v, dict)}
        def resolve(v):
            if definition.get('type') == 'user':
                return named(labels['users'].get(str(v)), str(v))
            return variants.get(str(v), v) if not isinstance(v, (dict, list)) else v
        display = [resolve(v) for v in value] if isinstance(value, list) else resolve(value)
        properties.append(dict(id=pid, name=definition.get('name') or f'Поле {pid}',
                               type=definition.get('type'), value=display, rawValue=value))
    checklists = []
    for name, data in raw.items():
        if name.startswith('checklist_') and isinstance(data, dict):
            checklists.append(data)
    if not checklists:
        checklists = card.get('checklists') or []
    columns = labels['columns']
    history = []
    for event in raw.get('history.json') or []:
        history.append(dict(event, columnName=named(columns.get(str(event.get('subcolumn_id') or event.get('column_id'))),
                                                   f'Колонка {event.get("column_id")}'),
                            boardName=(card.get('board') or {}).get('title') if event.get('board_id') == card.get('board_id') else f'Доска {event.get("board_id")}',
                            authorName=named(event.get('author') or labels['users'].get(str(event.get('author_id'))), 'Неизвестный участник')))
    user = lambda uid: named(labels['users'].get(str(uid)), f'Участник {uid}') if uid else 'Не указан'
    summary = dict(id=cid, uid=card.get('uid'), key=card.get('key'), title=card.get('title', ''),
                   description=card.get('description') or '', archived=bool(card.get('archived')),
                   blocked=bool(card.get('blocked')), asap=bool(card.get('asap')),
                   board=named(card.get('board') or dictionaries.get('board'), f'Доска {card.get("board_id")}'),
                   column=named(card.get('column') or columns.get(str(card.get('column_id')))),
                   lane=named(card.get('lane'), ''), type=card.get('type') or labels['types'].get(str(card.get('type_id')), {}),
                   owner=named(card.get('owner') or labels['users'].get(str(card.get('owner_id'))), 'Не указан'),
                   responsible=user(card.get('responsible_id')), created=card.get('created'), updated=card.get('updated'),
                   dueDate=card.get('due_date'), size=card.get('size_text') or card.get('size'),
                   state=card.get('state'), timeSpent=card.get('time_spent_sum'),
                   plannedStart=card.get('planned_start'), plannedEnd=card.get('planned_end'),
                   completedAt=card.get('completed_at'), source=card.get('source'),
                   lastMoved=card.get('last_moved_at'), email=card.get('email'))
    sections = {
        'comments': raw.get('comments.json', []),
        'members': raw.get('members.json', card.get('members') or []),
        'tags': card.get('tags') or [], 'properties': properties, 'checklists': checklists,
        'history': history, 'activity': raw.get('activity.json', []),
        'children': raw.get('children.json', card.get('children') or []),
        'parents': card.get('parents') or [], 'parentIds': card.get('parents_ids') or [],
        'childIds': card.get('children_ids') or [],
        'links': raw.get('links.json', card.get('external_links') or []),
        'blockers': raw.get('blockers.json', []), 'timeLogs': raw.get('time-logs.json', []),
        'iterations': raw.get('iterations.json', []), 'baselines': raw.get('baselines.json', []),
        'sla': raw.get('sla.json'),
    }
    return dict(schemaVersion=1, card=summary, sections=sections, files=files,
                imageMap=url_map, raw=raw, diagnostics=bundle.get('errors', []),
                sectionStatus={name: ('missing' if name + '.json' not in raw else
                                      'available' if raw[name + '.json'] else 'empty')
                               for name in ('comments', 'history', 'activity', 'files')},
                source=dict(snapshot=snapshot, jsonFiles=len(raw),
                            availableSections=list(raw), origin=bundle.get('origin', 'archive')))
