"""JSON-to-working-table mapping. Never calls Kaiten or modifies archive files."""
import hashlib
import mimetypes
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, localcontext

from sqlalchemy import delete, select

from . import board_models as m


class ImportConflict(ValueError):
    """The incoming snapshot must not replace a newer/local version."""


def integer(value, field='id', optional=True):
    if value is None and optional:
        return None
    if isinstance(value, bool) or not str(value).isdigit() or not 0 < int(value) < 2**63:
        raise ValueError(f'{field}: требуется положительный BIGINT')
    return int(value)


def timestamp(value):
    if value in (None, ''):
        return None
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except ValueError:
        raise ValueError('Неверный формат даты') from None


def decimal(value, optional=False, precision=50, scale=25):
    if value is None:
        return None if optional else Decimal(0)
    try:
        result = Decimal(str(value))
        with localcontext() as context:
            context.prec = precision + scale + 5
            if not result.is_finite() or abs(result) >= Decimal(10) ** (precision - scale) or result != result.quantize(Decimal(10) ** -scale):
                raise ValueError(f'Число не помещается в numeric({precision},{scale}) без потери точности')
        return result
    except InvalidOperation:
        raise ValueError('Неверный числовой формат') from None


def records(value, field):
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError(f'{field}: ожидается список объектов')
    return value


def present(data, mapping):
    """Only supplied fields can update an existing row; absent != empty."""
    result = {}
    for source, spec in mapping.items():
        if source not in data:
            continue
        target, convert = spec if isinstance(spec, tuple) else (spec, lambda x: x)
        result[target] = convert(data[source])
    return result


TEXT = lambda value: '' if value is None else str(value)
DATE_FIELDS = {key: (key, timestamp) for key in ('due_date', 'planned_start', 'planned_end', 'completed_at', 'last_moved_at')}


class BoardProjection:
    def __init__(self, session, source_id, archive, snapshot, *, verify_files=False, overwrite_local=False):
        self.session, self.source_id = session, source_id
        self.archive, self.snapshot = archive, snapshot
        self.verify_files, self.overwrite_local = verify_files, overwrite_local
        self.cache = {}
        self.warnings = []

    def find(self, model, source_id, card_id=None):
        key = (model, source_id, card_id)
        if key not in self.cache:
            filters = [model.source_instance_id == self.source_id, model.source_id == source_id]
            if card_id is not None:
                filters.append(model.card_id == card_id)
            self.cache[key] = self.session.scalar(select(model).where(*filters))
        return self.cache[key]

    def upsert(self, model, data, values, *, source_id=None, stub=False, card_id=None, reference=False):
        source_id = data.get('id') if source_id is None else source_id
        if model in (m.Attachment, m.ActivityEvent, m.CardLocationHistory):
            if source_id in (None, ''):
                raise ValueError(f'{model.__tablename__}: отсутствует ID')
            source_id = str(source_id)
        else:
            source_id = integer(source_id, optional=False)
        row = self.find(model, source_id, card_id)
        if row is not None:
            if (stub or reference) and not row.is_stub:
                return row
            if row.local_version > 1 and not self.overwrite_local:
                raise ImportConflict(f'{model.__tablename__}: есть локальные изменения')
            incoming = timestamp(data.get('updated'))
            saved = timestamp(row.source_updated_at.isoformat()) if row.source_updated_at else None
            if not row.is_stub and ((incoming and saved and incoming < saved) or
                (data.get('version') is not None and row.source_version is not None and int(data['version']) < row.source_version)):
                raise ImportConflict(f'{model.__tablename__}: снимок старее сохранённой версии')
        else:
            identity = f'{model.__tablename__}:{source_id}:{card_id or ""}'
            row = model(id=uuid.uuid5(self.source_id, identity), source_instance_id=self.source_id, source_id=source_id)
            self.session.add(row)
            self.cache[(model, source_id, card_id)] = row
        # Values must also be assigned for new instances, before a flush can occur.
        for key, value in values.items():
            if getattr(row, key) != value:
                setattr(row, key, value)
        row.is_stub = stub
        row.source_data = dict(row.source_data or {}, **data)
        if 'uid' in data:
            row.source_uid = data['uid']
        if 'created' in data:
            row.source_created_at = timestamp(data['created'])
        if 'updated' in data:
            row.source_updated_at = timestamp(data['updated'])
        if data.get('version') is not None:
            row.source_version = int(data['version'])
        self.session.flush()
        return row

    def user(self, source_id, data=None):
        if source_id is None:
            return None
        source_id = integer(source_id)
        payload = dict(data or {}, id=source_id)
        return self.upsert(m.User, payload, present(payload, {
            'full_name': ('full_name', TEXT), 'email': 'email', 'username': 'username',
            'activated': ('activated', bool), 'virtual': ('virtual', bool),
        }), stub=not bool(data), reference=True).id

    def board(self, source_id):
        source_id = integer(source_id, 'board_id', optional=False)
        return self.upsert(m.Board, {'id': source_id}, {'title': f'Доска {source_id}'}, stub=True).id

    def location(self, model, source_id, board_id):
        if source_id is None:
            return None
        source_id = integer(source_id)
        row = self.find(model, source_id)
        if row is not None:
            if row.board_id != board_id:
                raise ValueError('Колонка или дорожка принадлежит другой доске')
            return row.id
        return self.upsert(model, {'id': source_id}, {'board_id': board_id, 'title': f'Неизвестно · {source_id}'}, stub=True).id

    def reference_card(self, source_id):
        source_id = integer(source_id, 'related_card_id', optional=False)
        existing = self.find(m.Card, source_id)
        if existing:
            return existing.id
        # An unresolved related card must not be silently assigned to this board.
        unknown_id = uuid.uuid5(self.source_id, 'unresolved-board')
        if self.session.get(m.Board, unknown_id) is None:
            self.session.add(m.Board(id=unknown_id, source_instance_id=self.source_id, is_stub=True,
                                     title='Доска не определена', source_data={}))
            self.session.flush()
        return self.upsert(m.Card, {'id': source_id}, {'board_id': unknown_id, 'title': f'Карточка {source_id}'}, stub=True).id

    def seed(self, dictionaries):
        for data in records(dictionaries.get('types', []), 'types'):
            self.upsert(m.CardType, data, present(data, {
                'name': ('name', TEXT), 'color': 'color', 'letter': 'letter',
                'description_template': 'description_template', 'archived': ('archived', bool),
            }) | {'settings': {key: data[key] for key in ('properties', 'card_properties', 'suggest_fields') if key in data}})
        board = dictionaries.get('board')
        if not isinstance(board, dict) or not board.get('id'):
            raise ValueError('Не найден корректный board/board.json')
        default_type = board.get('default_card_type_id')
        if default_type:
            default_type = self.upsert(m.CardType, {'id': default_type}, {'name': 'Неизвестный тип'}, stub=True).id
        board_id = self.upsert(m.Board, board, present(board, {'title': ('title', TEXT), 'description': 'description', 'settings': 'settings'}) |
                               {'default_card_type_id': default_type}).id
        columns = list(records(dictionaries.get('columns', board.get('columns', [])), 'columns'))
        for key, values in dictionaries.items():
            if key.startswith('subcolumns_'):
                parent = integer(key.removeprefix('subcolumns_'))
                columns.extend(dict(item, column_id=parent) for item in records(values, key))
        parents = {integer(item['id']): integer(item.get('column_id')) for item in columns}
        for cid in parents:
            seen, parent = {cid}, parents[cid]
            while parent is not None:
                if parent in seen:
                    raise ValueError('Цикл в иерархии колонок')
                seen.add(parent); parent = parents.get(parent)
        # Parent stubs are present before the deferred composite foreign key is checked.
        for data in columns:
            target_board = self.board(data.get('board_id') or board['id'])
            parent = self.location(m.Column, data.get('column_id'), target_board)
            self.upsert(m.Column, data, present(data, {
                'title': ('title', TEXT), 'sort_order': ('sort_order', decimal), 'type': 'type',
                'wip_limit': 'wip_limit', 'wip_limit_type': 'wip_limit_type',
            }) | {'board_id': target_board, 'parent_column_id': parent, 'settings': data.get('rules') or {}})
        for data in records(dictionaries.get('lanes', board.get('lanes', [])), 'lanes'):
            self.upsert(m.Lane, data, present(data, {'title': ('title', TEXT), 'sort_order': ('sort_order', decimal), 'wip_limit': 'wip_limit'}) |
                        {'board_id': self.board(data.get('board_id') or board['id'])})
        for data in records(dictionaries.get('users', []), 'users'):
            self.upsert(m.User, data, present(data, {'full_name': ('full_name', TEXT), 'email': 'email', 'username': 'username',
                                                   'activated': ('activated', bool), 'virtual': ('virtual', bool)}))
        for data in records(dictionaries.get('tags', []), 'tags'):
            self.upsert(m.Tag, data, present(data, {'name': ('name', TEXT), 'color': 'color', 'archived': ('archived', bool)}))
        for data in records(dictionaries.get('fields', []), 'fields'):
            prop = self.upsert(m.CustomProperty, data, {'name': TEXT(data.get('name')), 'type': str(data.get('type') or 'unknown'),
                                                      'archived': bool(data.get('archived')), 'settings': data.get('settings') or {}})
            for option in records(dictionaries.get(f'field_values_{data["id"]}', []), 'field values'):
                self.upsert(m.PropertyOption, option, {'property_id': prop.id, 'label': TEXT(option.get('value', option.get('name'))),
                                                      'sort_order': decimal(option.get('sort_order'))})

    def replace_links(self, model, card_id, values):
        self.session.execute(delete(model).where(model.card_id == card_id))
        for value in values:
            self.session.merge(model(card_id=card_id, **value))
        self.session.flush()

    def historical_location(self, model, source_id, board_id):
        if source_id is None:
            return None
        row = self.find(model, integer(source_id))
        # History records the old board separately; it cannot relocate a current
        # column/lane or reject an event just because that object moved later.
        return row.id if row is not None else self.location(model, source_id, board_id)

    def project(self, bundle):
        raw, data = bundle['raw'], bundle['raw']['card.json']
        source_card_id = integer(data.get('id'), optional=False)
        previous = self.find(m.Card, source_card_id)
        if 'board_id' in data:
            board_id = self.board(data['board_id'])
        elif previous is not None and not previous.is_stub:
            board_id = previous.board_id
        else:
            raise ValueError('Для новой карточки требуется board_id')
        owner = data.get('owner') or {}
        type_id = data.get('type_id', (data.get('type') or {}).get('id'))
        if type_id is not None:
            type_id = self.upsert(m.CardType, data.get('type') or {'id': type_id}, {'name': TEXT((data.get('type') or {}).get('name'))},
                                  stub=not bool(data.get('type')), reference=True).id
        values = present(data, {
            'title': ('title', TEXT), 'description': ('description', TEXT), 'sort_order': ('sort_order', decimal),
            'asap': ('asap', bool), 'archived': ('archived', bool), 'due_date_time_present': ('due_date_time_present', bool),
            'size': ('size', lambda value: decimal(value, optional=True, precision=30, scale=10)), 'size_unit': ('size_unit', lambda value: None if value is None else str(value)),
            'size_text': 'size_text', 'external_id': ('external_id', lambda value: None if value is None else str(value)), **DATE_FIELDS,
        })
        values.update(board_id=board_id, display_number=source_card_id)
        if 'column_id' in data or 'subcolumn_id' in data:
            values['column_id'] = self.location(m.Column, data.get('subcolumn_id') or data.get('column_id'), board_id)
        if 'lane_id' in data:
            values['lane_id'] = self.location(m.Lane, data['lane_id'], board_id)
        if 'type_id' in data or 'type' in data:
            values['type_id'] = type_id
        if 'owner_id' in data or 'owner' in data:
            values['owner_id'] = self.user(data.get('owner_id', owner.get('id')), owner or None)
        card = self.upsert(m.Card, data, values)
        self.members(card, raw, data)
        self.tags(card, data)
        self.properties(card, data)
        self.comments(card, raw)
        self.checklists(card, raw, data)
        self.relations(card, raw, data)
        for link in records(raw.get('links.json', data.get('external_links', [])), 'links'):
            self.upsert(m.ExternalLink, link, {'card_id': card.id, 'url': TEXT(link.get('url')), 'description': link.get('description')})
        for blocker in records(raw.get('blockers.json', []), 'blockers'):
            blocking = blocker.get('blocker_card_id')
            self.upsert(m.CardBlocker, blocker, {
                'card_id': card.id, 'blocking_card_id': self.reference_card(blocking) if blocking else None,
                'created_by_id': self.user(blocker.get('blocker_id'), blocker.get('blocker')),
                'reason': TEXT(blocker.get('reason')), 'due_date': timestamp(blocker.get('due_date')),
                'released': bool(blocker.get('released')), 'released_by_id': self.user(blocker.get('released_by_id')),
            })
        self.events(card, raw)
        self.files(card, raw, data)
        return card

    def members(self, card, raw, data):
        items = raw.get('members.json', data.get('members'))
        if items is not None:
            values = []
            for member in records(items, 'members'):
                values.append({'user_id': self.user(member.get('user_id') or member.get('id'), member),
                               'role': int(member['type']) if member.get('type') is not None else 1,
                               'source_id': integer(member.get('id'))})
            self.replace_links(m.CardMember, card.id, values)
        if 'subscribers' in data:
            self.replace_links(m.CardSubscriber, card.id, [
                {'user_id': self.user(item.get('user_id') or item.get('id'), item)}
                for item in records(data['subscribers'], 'subscribers')])

    def tags(self, card, data):
        if 'tags' not in data:
            return
        links = []
        for item in records(data['tags'], 'tags'):
            tag_id = integer(item.get('tag_id') or item.get('id'), optional=False)
            tag = self.upsert(m.Tag, dict(item, id=tag_id), present(item, {'name': ('name', TEXT), 'color': 'color'}), reference=True)
            links.append({'tag_id': tag.id, 'source_assignment_id': integer(item.get('id'))})
        self.replace_links(m.CardTag, card.id, links)

    def property(self, card, pid, value=None):
        prop = self.upsert(m.CustomProperty, {'id': integer(pid, 'property_id', optional=False)},
                           {'name': f'Поле {pid}', 'type': 'unknown'}, stub=True)
        self.session.merge(m.CardPropertyValue(card_id=card.id, property_id=prop.id, value=value))
        self.session.flush()
        return prop.id

    def properties(self, card, data):
        if 'properties' not in data or data['properties'] is None:
            return
        if not isinstance(data['properties'], dict):
            raise ValueError('properties: ожидается объект')
        for pid, value in data['properties'].items():
            self.property(card, pid.removeprefix('id_'), value)

    def comments(self, card, raw):
        for item in records(raw.get('comments.json', []), 'comments'):
            self.upsert(m.Comment, item, {'card_id': card.id, 'author_id': self.user(item.get('author_id'), item.get('author')),
                'text': TEXT(item.get('text')), 'text_format': int(item.get('type') or 1),
                'edited': bool(item.get('edited')), 'deleted': bool(item.get('deleted')), 'internal': bool(item.get('internal')),
                'extra': item.get('meta') or {}})

    def checklists(self, card, raw, data):
        checks = {integer(item.get('checklist_id') or item.get('id'), optional=False): item
                  for item in records(data.get('checklists', []), 'checklists')}
        for name, value in raw.items():
            if name.startswith('checklist_') and isinstance(value, dict):
                checks[integer(value.get('id'), optional=False)] = dict(checks.get(value['id'], {}), **value)
        links = []
        for cid, item in checks.items():
            check = self.upsert(m.Checklist, dict(item, id=cid), {'name': TEXT(item.get('name')), 'policy_id': item.get('policy_id')})
            links.append({'checklist_id': check.id, 'sort_order': decimal(item.get('sort_order'))})
            for entry in records(item.get('items', []), 'checklist items'):
                self.upsert(m.ChecklistItem, entry, {'checklist_id': check.id, 'text': TEXT(entry.get('text')),
                    'sort_order': decimal(entry.get('sort_order')), 'checked': bool(entry.get('checked')),
                    'checker_id': self.user(entry.get('checker_id')), 'responsible_id': self.user(entry.get('responsible_id')),
                    'checked_at': timestamp(entry.get('checked_at')), 'due_date': timestamp(entry.get('due_date')),
                    'deleted': bool(entry.get('deleted'))})
        if checks or 'checklists' in data:
            self.replace_links(m.CardChecklist, card.id, links)

    def relations(self, card, raw, data):
        for incoming, ids_key, list_key in ((True, 'parents_ids', 'parents'), (False, 'children_ids', 'children')):
            items = raw.get('children.json') if not incoming and 'children.json' in raw else data.get(list_key)
            if ids_key not in data and items is None:
                continue
            ids = set(data.get(ids_key) or [])
            if items is not None:
                ids.update(item['id'] for item in records(items, list_key))
            field = m.CardRelation.child_card_id if incoming else m.CardRelation.parent_card_id
            self.session.execute(delete(m.CardRelation).where(field == card.id, m.CardRelation.kind == 'parent_child'))
            for source_id in ids:
                other = self.reference_card(source_id)
                parent, child = (other, card.id) if incoming else (card.id, other)
                descendants = select(m.CardRelation.child_card_id.label('id')).where(m.CardRelation.parent_card_id == child).cte(recursive=True)
                descendants = descendants.union(select(m.CardRelation.child_card_id).join(descendants, m.CardRelation.parent_card_id == descendants.c.id))
                if parent == child or self.session.scalar(select(descendants.c.id).where(descendants.c.id == parent).limit(1)):
                    raise ValueError('Цикл в отношениях карточек')
                self.session.merge(m.CardRelation(parent_card_id=parent, child_card_id=child, kind='parent_child'))
                self.session.flush()

    def events(self, card, raw):
        for item in records(raw.get('history.json', []), 'history'):
            board = self.board(item.get('board_id')) if item.get('board_id') else card.board_id
            changed = timestamp(item.get('changed'))
            if changed is None:
                raise ValueError('history: отсутствует дата события')
            self.upsert(m.CardLocationHistory, item, {
                'card_id': card.id, 'board_id': board,
                'column_id': self.historical_location(m.Column, item.get('column_id'), board),
                'subcolumn_id': self.historical_location(m.Column, item.get('subcolumn_id'), board),
                'lane_id': self.historical_location(m.Lane, item.get('lane_id'), board),
                'author_id': self.user(item.get('author_id'), item.get('author')),
                'changed_at': changed, 'source_condition': item.get('condition'),
            })
        for item in records(raw.get('activity.json', []), 'activity'):
            occurred = timestamp(item.get('created'))
            if occurred is None:
                raise ValueError('activity: отсутствует дата события')
            self.upsert(m.ActivityEvent, item, {'card_id': card.id, 'author_id': self.user(item.get('author_id'), item.get('author')),
                        'action': TEXT(item.get('action')), 'occurred_at': occurred, 'data': item.get('data') or {}})

    def files(self, card, raw, data):
        original = {str(item['id']): item for item in records(data.get('files', []), 'card files')}
        manifests = records(raw.get('files.json', []), 'files')
        downloaded = {str(item['id']): (index, item) for index, item in enumerate(manifests)}
        for fid in original.keys() | downloaded.keys():
            api = original.get(fid, {})
            index, manifest = downloaded.get(fid, (None, {}))
            status = manifest.get('status') or 'not_exported'
            file_object, error = None, None
            if status == 'saved':
                try:
                    path, _ = self.archive.asset_path(self.snapshot, card.source_id, index)
                    size = path.stat().st_size
                    if manifest.get('size') is not None and size != int(manifest['size']):
                        raise ValueError('Размер файла не совпадает с манифестом')
                    checksum = manifest.get('sha256')
                    verified = False
                    if self.verify_files:
                        with path.open('rb') as stream:
                            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
                        if checksum and checksum != actual:
                            raise ValueError('Контрольная сумма файла не совпадает')
                        checksum, verified = actual, True
                    storage_key = f'{self.snapshot}/{path.relative_to(self.archive.snapshot_path(self.snapshot)).as_posix()}'
                    file_object = self.session.scalar(select(m.FileObject).where(m.FileObject.storage_key == storage_key))
                    if file_object is None:
                        file_object = m.FileObject(storage_key=storage_key, size=size)
                        self.session.add(file_object)
                    file_object.sha256, file_object.hash_verified = checksum, verified
                    file_object.mime_type = api.get('mime_type') or mimetypes.guess_type(path.name)[0]
                    self.session.flush()
                except (OSError, ValueError):
                    status, error = 'missing', 'Не удалось проверить локальный файл'
                    self.warnings.append({'card_id': card.source_id, 'file_id': fid, 'message': error})
            comment_id, property_id = None, None
            if api.get('comment_id'):
                comment_id = self.upsert(m.Comment, {'id': api['comment_id']}, {'card_id': card.id, 'text': ''}, stub=True).id
            elif api.get('custom_property_id'):
                pid = api['custom_property_id']
                prop = self.find(m.CustomProperty, integer(pid))
                if prop is not None and self.session.get(m.CardPropertyValue, (card.id, prop.id)) is not None:
                    property_id = prop.id
                else:
                    property_id = self.property(card, pid)
            payload = dict(api, id=fid, _manifest=manifest, _snapshot=self.snapshot)
            self.upsert(m.Attachment, payload, {'card_id': card.id, 'comment_id': comment_id, 'property_id': property_id,
                'file_object_id': file_object.id if file_object is not None and not error else None,
                'author_id': self.user(api.get('author_id'), api.get('author')),
                'name': TEXT(manifest.get('name') or api.get('name') or 'Файл'),
                'sort_order': decimal(api.get('sort_order')), 'card_cover': bool(api.get('card_cover')),
                'deleted': bool(api.get('deleted')), 'external': bool(api.get('external')), 'status': status, 'error': error},
                source_id=fid, card_id=card.id)
