"""Explicit, offline update of working tables from a saved JSON snapshot."""
import hashlib
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from urllib.parse import urlsplit

from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.infrastructure.database.board_models import SourceInstance
from backend.app.infrastructure.database.board_projection import BoardProjection, ImportConflict
from backend.app.infrastructure.database.models import ArchiveCard, ArchiveSnapshot


def normalize_origin(value):
    parts = urlsplit(value or '')
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.path not in ('', '/') or parts.query or parts.fragment:
        raise ValueError('origin: нужен HTTPS-адрес компании без пути и токена')
    return f'https://{parts.hostname.lower()}' + (f':{parts.port}' if parts.port and parts.port != 443 else '')


def prepare(source, snapshot, card_ids=None, limit=None, origin=None):
    root = source.snapshot_path(snapshot)
    report = source.report(snapshot)
    origin = normalize_origin(origin or report.get('origin'))
    dictionaries = source.dictionaries(snapshot)
    for path in (root / 'board').glob('*.json'):
        if not path.name.startswith('cards_') and path.stem not in dictionaries:
            raise ValueError(f'Не удалось прочитать справочник {path.name}')
    ids = sorted(set(card_ids), reverse=True) if card_ids else [item['id'] for item in source.index(snapshot)]
    if limit:
        ids = ids[:limit]
    return origin, dictionaries, ids, report


@contextmanager
def import_lock(engine, origin):
    """One PostgreSQL importer per company; session lock survives batch commits."""
    if engine.dialect.name != 'postgresql':
        yield
        return
    key = int.from_bytes(hashlib.sha256(('board-import:' + origin).encode()).digest()[:8], 'big', signed=True)
    with engine.connect() as connection:
        locked = connection.scalar(text('SELECT pg_try_advisory_lock(:key)'), {'key': key})
        connection.commit()
        if not locked:
            raise ValueError('Для этой компании уже выполняется обновление базы')
        try:
            yield
        finally:
            connection.execute(text('SELECT pg_advisory_unlock(:key)'), {'key': key})
            connection.commit()


def update_board(source, engine, snapshot, *, card_ids=None, limit=None, origin=None,
                 batch_size=50, verify_files=False, overwrite_local=False, plan=False, progress=None):
    if not 1 <= batch_size <= 1000 or (limit is not None and limit <= 0):
        raise ValueError('Неверный размер пакета или лимит карточек')
    if card_ids and any(isinstance(cid, bool) or not isinstance(cid, int) or cid <= 0 for cid in card_ids):
        raise ValueError('Номера карточек должны быть положительными целыми числами')
    origin, dictionaries, ids, source_report = prepare(source, snapshot, card_ids, limit, origin)
    result = {'snapshot': snapshot, 'origin': origin, 'planned_cards': len(ids),
              'source_status': source_report.get('status', 'unknown'),
              'limited': bool(card_ids or limit), 'verify_files': verify_files,
              'saved': 0, 'conflicts': [], 'errors': [], 'warnings': [],
              'started_at': datetime.now(timezone.utc).isoformat()}
    if plan:
        return dict(result, status='plan', card_ids=ids,
                    note='База не подключалась. Число новых и изменённых записей определяется при выполнении.')
    if engine is None or not inspect(engine).has_table('cards'):
        raise ValueError('Не найдены рабочие таблицы. Сначала примените миграции.')
    sort_type = next(item['type'] for item in inspect(engine).get_columns('cards') if item['name'] == 'sort_order')
    if sort_type.precision != 50 or sort_type.scale != 25:
        raise ValueError('Для точного порядка карточек требуется миграция 0003_sort_order или новее')
    with import_lock(engine, origin):
        with Session(engine) as session, session.begin():
            instance = session.scalar(select(SourceInstance).where(SourceInstance.origin == origin))
            if instance is None:
                instance = SourceInstance(id=uuid.uuid5(uuid.NAMESPACE_URL, origin), origin=origin, name=origin)
                session.add(instance)
            session.flush()
            source_id = instance.id
            previous = session.get(ArchiveSnapshot, snapshot)
            if previous and previous.summary.get('origin', origin) != origin:
                raise ValueError('Имя снимка уже занято данными другой компании')
            summary = next(item for item in source.snapshots() if item['id'] == snapshot)
            summary.update(origin=origin, status='importing')
            session.merge(ArchiveSnapshot(id=snapshot, summary=summary, dictionaries=dictionaries))
            BoardProjection(session, source_id, source, snapshot, overwrite_local=overwrite_local).seed(dictionaries)
        for start in range(0, len(ids), batch_size):
            committed, conflicts, errors, warnings = 0, [], [], []
            with Session(engine) as session, session.begin():
                for cid in ids[start:start + batch_size]:
                    try:
                        bundle = source.load_card(snapshot, cid)
                        if bundle['raw']['card.json']['id'] != cid:
                            raise ValueError('ID карточки не совпадает с именем папки')
                        with session.begin_nested():
                            projector = BoardProjection(session, source_id, source, snapshot,
                                                        verify_files=verify_files, overwrite_local=overwrite_local)
                            card = projector.project(bundle)
                            archived = session.get(ArchiveCard, (snapshot, cid))
                            retained = set(archived.raw) - set(bundle['raw']) if archived else set()
                            raw = dict(archived.raw if archived else {}, **bundle['raw'])
                            diagnostics = list(bundle['errors'])
                            if retained:
                                diagnostics.append('Разделы, отсутствующие в новых JSON, сохранены из предыдущей записи: ' + ', '.join(sorted(retained)))
                            session.merge(ArchiveCard(snapshot_id=snapshot, card_id=cid,
                                title=card.title, archived=card.archived,
                                column_id=bundle['raw']['card.json'].get('column_id'),
                                updated=bundle['raw']['card.json'].get('updated'),
                                search_text=f'{cid}\n{card.title}'.casefold(), raw=raw, diagnostics=diagnostics))
                            session.flush()
                        committed += 1
                        warnings.extend(projector.warnings)
                        if diagnostics:
                            warnings.append({'card_id': cid, 'message': 'В исходной копии есть замечания', 'count': len(diagnostics)})
                    except ImportConflict as error:
                        conflicts.append({'card_id': cid, 'message': str(error)})
                    except (OSError, ValueError, IntegrityError) as error:
                        # SQL exception strings can contain raw JSON and credentials.
                        message = str(error) if type(error) is ValueError else type(error).__name__
                        errors.append({'card_id': cid, 'message': message})
            # Only committed batches are included in progress/report counts.
            result['saved'] += committed
            result['conflicts'].extend(conflicts)
            result['errors'].extend(errors)
            result['warnings'].extend(warnings)
            if progress:
                progress(min(start + batch_size, len(ids)), len(ids), result['saved'])
        result['status'] = 'partial' if (result['errors'] or result['conflicts'] or result['warnings'] or result['source_status'] != 'complete') else 'complete'
        result['finished_at'] = datetime.now(timezone.utc).isoformat()
        with Session(engine) as session, session.begin():
            record = session.get(ArchiveSnapshot, snapshot)
            summary = dict(record.summary)
            count = session.scalar(select(func.count()).select_from(ArchiveCard).where(ArchiveCard.snapshot_id == snapshot))
            summary.update(cards=count, status='partial' if result['status'] == 'partial' else 'limited' if result['limited'] else result['source_status'])
            record.summary = summary
    return result
