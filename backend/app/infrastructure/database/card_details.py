"""Working card details. Current tables win; retained SQL snapshots supply unmapped sections only."""
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from urllib.parse import urlsplit

from sqlalchemy import select, or_
from sqlalchemy.orm import Session
from . import board_models as m
from .models import ArchiveCard, ArchiveSnapshot


def json_value(value):
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 9007199254740991:
        return str(value)
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    return value


def read_card_details(engine, card_id):
    with Session(engine) as session:
        card = session.scalar(select(m.Card).where(m.Card.id == card_id, m.Card.is_stub.is_(False), m.Card.deleted_at.is_(None)))
        if card is None:
            raise FileNotFoundError('Карточка не найдена или удалена')
        board = session.get(m.Board, card.board_id)
        column = session.get(m.Column, card.column_id) if card.column_id else None
        lane = session.get(m.Lane, card.lane_id) if card.lane_id else None
        card_type = session.get(m.CardType, card.type_id) if card.type_id else None
        comments = list(session.scalars(select(m.Comment).where(m.Comment.card_id == card_id, m.Comment.is_stub.is_(False))
            .order_by(m.Comment.source_created_at.desc(), m.Comment.id)))
        members = list(session.execute(select(m.CardMember.user_id, m.CardMember.role).where(m.CardMember.card_id == card_id)))
        subscribers = list(session.scalars(select(m.CardSubscriber.user_id).where(m.CardSubscriber.card_id == card_id)))
        tags = list(session.scalars(select(m.Tag).join(m.CardTag, m.CardTag.tag_id == m.Tag.id).where(m.CardTag.card_id == card_id).order_by(m.Tag.name, m.Tag.id)))
        checks = list(session.execute(select(m.Checklist, m.CardChecklist.sort_order).join(m.CardChecklist,
            m.CardChecklist.checklist_id == m.Checklist.id).where(m.CardChecklist.card_id == card_id).order_by(m.CardChecklist.sort_order, m.Checklist.id)))
        check_ids = [row[0].id for row in checks]
        items = list(session.scalars(select(m.ChecklistItem).where(m.ChecklistItem.checklist_id.in_(check_ids))
            .order_by(m.ChecklistItem.sort_order, m.ChecklistItem.id))) if check_ids else []
        history = list(session.scalars(select(m.CardLocationHistory).where(m.CardLocationHistory.card_id == card_id)
            .order_by(m.CardLocationHistory.changed_at.desc(), m.CardLocationHistory.id)))
        activity = list(session.scalars(select(m.ActivityEvent).where(m.ActivityEvent.card_id == card_id)
            .order_by(m.ActivityEvent.occurred_at.desc(), m.ActivityEvent.id)))
        blockers = list(session.scalars(select(m.CardBlocker).where(m.CardBlocker.card_id == card_id).order_by(m.CardBlocker.id)))
        user_ids = {card.owner_id, *subscribers, *(row.user_id for row in members), *(row.author_id for row in comments),
            *(row.author_id for row in history), *(row.author_id for row in activity),
            *(row.responsible_id for row in items), *(row.checker_id for row in items),
            *(row.created_by_id for row in blockers), *(row.released_by_id for row in blockers)} - {None}
        users = {row.id: row for row in session.scalars(select(m.User).where(m.User.id.in_(user_ids)))} if user_ids else {}

        def person(identifier):
            row = users.get(identifier)
            return {'id': row.id, 'name': row.full_name or row.username or 'Участник', 'email': row.email} if row else None

        def location(row):
            return {'id': row.id, 'title': row.title} if row else None

        links = list(session.scalars(select(m.ExternalLink).where(m.ExternalLink.card_id == card_id).order_by(m.ExternalLink.id)))
        properties = list(session.execute(select(m.CustomProperty, m.CardPropertyValue.value).join(m.CardPropertyValue,
            m.CardPropertyValue.property_id == m.CustomProperty.id).where(m.CardPropertyValue.card_id == card_id).order_by(m.CustomProperty.name)))
        property_ids = [row[0].id for row in properties]
        options = list(session.scalars(select(m.PropertyOption).where(m.PropertyOption.property_id.in_(property_ids)))) if property_ids else []
        option_names = {(row.property_id, str(row.source_id)): row.label for row in options}

        def display_property(prop, value):
            if isinstance(value, list):
                return [display_property(prop, entry) for entry in value]
            return option_names.get((prop.id, str(value)), value) if not isinstance(value, dict) else value

        relations = list(session.execute(select(m.CardRelation.parent_card_id, m.CardRelation.child_card_id)
            .where(or_(m.CardRelation.parent_card_id == card_id, m.CardRelation.child_card_id == card_id))))
        related_ids = {identifier for relation in relations for identifier in relation} - {card_id}
        related = list(session.execute(select(m.Card.id, m.Card.display_number, m.Card.title, m.Card.is_stub, m.Card.deleted_at, m.Card.archived)
            .where(m.Card.id.in_(related_ids)))) if related_ids else []
        related_map = {row.id: {'id': row.id, 'number': str(row.display_number) if row.display_number is not None else None,
            'title': row.title, 'available': not row.is_stub and row.deleted_at is None, 'archived': row.archived} for row in related}
        files, image_map = [], {}
        for attachment, obj in session.execute(select(m.Attachment, m.FileObject).outerjoin(m.FileObject,
                m.FileObject.id == m.Attachment.file_object_id).where(m.Attachment.card_id == card_id).order_by(m.Attachment.sort_order, m.Attachment.id)):
            available = attachment.status == 'saved' and obj is not None and not attachment.deleted
            url = f'/api/v1/attachments/{attachment.id}/content' if available else None
            files.append({'id': attachment.id, 'name': attachment.name, 'size': obj.size if obj else None,
                'mime': obj.mime_type if obj else None, 'status': attachment.status, 'deleted': attachment.deleted,
                'cover': attachment.card_cover, 'commentId': attachment.comment_id, 'propertyId': attachment.property_id,
                'url': url, 'downloadUrl': url + '?download=1' if url else None, 'sha256': obj.sha256 if obj else None,
                'error': attachment.error})
            if url and obj.mime_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'):
                original = (attachment.source_data or {}).get('url')
                image_map[url] = url
                if original:
                    image_map[original] = url
                    image_map[urlsplit(original).path] = url
                name = obj.storage_key.rsplit('/', 1)[-1]
                if name.startswith('inline_') and len(name.split('_', 2)) == 3:
                    image_map['basename:' + name.split('_', 2)[2]] = url

        # Unmapped API sections remain in SQL archive records, never re-read JSON folders.
        raw, diagnostics, snapshot = {}, [], None
        source = session.get(m.SourceInstance, card.source_instance_id) if card.source_instance_id else None
        if source and card.source_id is not None:
            retained = session.execute(select(ArchiveCard.raw, ArchiveCard.diagnostics, ArchiveCard.snapshot_id)
                .join(ArchiveSnapshot, ArchiveSnapshot.id == ArchiveCard.snapshot_id).where(ArchiveCard.card_id == card.source_id,
                    ArchiveSnapshot.summary['origin'].as_string() == source.origin).order_by(ArchiveCard.snapshot_id.desc()).limit(1)).first()
            if retained:
                raw, diagnostics, snapshot = retained
        column_ids = {row.subcolumn_id or row.column_id for row in history} - {None}
        columns = {row.id: row.title for row in session.scalars(select(m.Column).where(m.Column.id.in_(column_ids)))} if column_ids else {}
        handled = {'card.json', 'comments.json', 'members.json', 'files.json', 'history.json', 'activity.json', 'children.json', 'links.json', 'blockers.json'}
        extras = {key: value for key, value in raw.items() if key not in handled and not key.startswith('checklist_')}
        result = {
            'schemaVersion': 1,
            'card': {'id': card.id, 'number': str(card.display_number) if card.display_number is not None else None,
                'title': card.title, 'description': card.description, 'version': card.local_version,
                'board': location(board), 'column': location(column), 'lane': location(lane),
                'type': {'name': card_type.name, 'letter': card_type.letter} if card_type else None,
                'owner': person(card.owner_id), 'archived': card.archived, 'asap': card.asap,
                'created': card.source_created_at or card.created_at, 'updated': card.source_updated_at or card.updated_at,
                'dueDate': card.due_date, 'plannedStart': card.planned_start, 'plannedEnd': card.planned_end,
                'completedAt': card.completed_at, 'lastMoved': card.last_moved_at, 'size': str(card.size) if card.size is not None else None,
                'sizeUnit': card.size_unit, 'sizeText': card.size_text, 'externalId': card.external_id, 'sourceId': str(card.source_id) if card.source_id else None},
            'members': [dict(person(row.user_id) or {'id': row.user_id, 'name': 'Участник', 'email': None}, role=row.role) for row in members],
            'subscribers': [person(identifier) for identifier in subscribers if person(identifier)],
            'tags': [{'id': row.id, 'name': row.name, 'color': row.color} for row in tags],
            'properties': [{'id': prop.id, 'name': prop.name, 'type': prop.type, 'value': display_property(prop, value), 'rawValue': value} for prop, value in properties],
            'checklists': [{'id': check.id, 'name': check.name, 'items': [{'id': row.id, 'text': row.text, 'checked': row.checked,
                'deleted': row.deleted, 'dueDate': row.due_date, 'responsible': person(row.responsible_id),
                'checker': person(row.checker_id), 'checkedAt': row.checked_at} for row in items if row.checklist_id == check.id]} for check, order in checks],
            'files': files, 'imageMap': image_map,
            'comments': [{'id': row.id, 'author': person(row.author_id), 'text': row.text, 'textFormat': row.text_format,
                'created': row.source_created_at or row.created_at, 'edited': row.edited, 'deleted': row.deleted, 'internal': row.internal, 'extra': row.extra} for row in comments],
            'history': [{'id': row.id, 'changed': row.changed_at, 'column': columns.get(row.subcolumn_id or row.column_id, 'Неизвестная колонка'),
                'author': person(row.author_id), 'boardId': row.board_id, 'laneId': row.lane_id, 'condition': row.source_condition} for row in history],
            'activity': [{'id': row.id, 'created': row.occurred_at, 'action': row.action, 'author': person(row.author_id), 'data': row.data} for row in activity],
            'parents': [related_map[parent] for parent, child in relations if child == card_id and parent in related_map],
            'children': [related_map[child] for parent, child in relations if parent == card_id and child in related_map],
            'links': [{'id': row.id, 'url': row.url, 'description': row.description} for row in links],
            'blockers': [{'id': row.id, 'reason': row.reason, 'blockingCardId': row.blocking_card_id, 'released': row.released,
                'dueDate': row.due_date, 'releasedAt': row.released_at, 'createdBy': person(row.created_by_id), 'releasedBy': person(row.released_by_id)} for row in blockers],
            'extras': extras, 'raw': dict(raw, **{'working-card-source': card.source_data or {}}),
            'source': {'snapshot': snapshot, 'origin': source.origin if source else None, 'diagnostics': diagnostics},
        }
        return json_value(result)
