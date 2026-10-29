"""Enrich existing SQL rows only. Does not reimport cards or contact Kaiten."""
import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.app.infrastructure.database.board_models import User, Card, SourceInstance
from backend.app.infrastructure.database.models import ArchiveSnapshot, ArchiveCard
from backend.app.infrastructure.database.auth_models import SourceRecord


def enrich_existing(engine):
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    insert = pg_insert if engine.dialect.name == 'postgresql' else sqlite_insert
    count = 0
    with Session(engine) as session, session.begin():
        users = list(session.scalars(select(User)))
        for user in users:
            data = user.source_data or {}
            for attr, key in [('initials', 'initials'), ('timezone', 'timezone'), ('language', 'lng')]:
                if getattr(user, attr) is None and isinstance(data.get(key), str):
                    setattr(user, attr, data[key][:100 if attr == 'timezone' else 32])
            if user.avatar_url is None:
                user.avatar_url = data.get('avatar_uploaded_url') or data.get('avatar_initials_url')
        origins = {row.origin: row.id for row in session.scalars(select(SourceInstance))}
        cards = {(row.source_instance_id, row.source_id): row.id for row in session.execute(select(Card.id, Card.source_instance_id, Card.source_id).where(Card.source_id.is_not(None)))}
        profiles = {(row.source_instance_id, row.source_id): row.id for row in users}
        for snapshot in session.scalars(select(ArchiveSnapshot)):
            source = origins.get(snapshot.summary.get('origin'))
            if not source:
                continue
            records = []
            def record(kind, identifier, path, pointer=None):
                if not identifier:
                    return
                records.append({'id': uuid.uuid5(identifier, f'{snapshot.id}:{path}'), 'snapshot_id': snapshot.id,
                    'entity_type': kind, 'entity_id': identifier, 'relative_path': path, 'json_pointer': pointer})
            raw_users = snapshot.dictionaries.get('users', [])
            if isinstance(raw_users, dict):
                raw_users = raw_users.get('users', [])
            if isinstance(raw_users, list):
                for index, user in enumerate(raw_users):
                    if isinstance(user, dict):
                        record('users', profiles.get((source, user.get('id'))), 'board/users.json', f'/{index}')
            for source_id in session.scalars(select(ArchiveCard.card_id).where(ArchiveCard.snapshot_id == snapshot.id)):
                record('cards', cards.get((source, source_id)), f'cards/{source_id}/card.json')
            for start in range(0, len(records), 500):
                session.execute(insert(SourceRecord).values(records[start:start+500]).on_conflict_do_nothing(index_elements=['snapshot_id', 'entity_type', 'entity_id', 'relative_path']))
            count += len(records)
    return {'profiles': len(users), 'sourceLocationsExamined': count}
