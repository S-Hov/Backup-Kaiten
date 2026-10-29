"""Local writes; imported source identities are never modified."""
import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from uuid import uuid4, uuid5
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException
from .board_models import Board, Card, Column, Comment, Attachment, FileObject, CardLocationHistory


def move_next(engine, card_id, version, actor=None):
    with Session(engine) as session, session.begin():
        board_id = session.scalar(select(Card.board_id).where(Card.id == card_id))
        if board_id is None:
            raise FileNotFoundError('Карточка не найдена')
        session.scalar(select(Board).where(Board.id == board_id).with_for_update())
        card = session.scalar(select(Card).where(Card.id == card_id).with_for_update())
        if card.is_stub or card.deleted_at is not None:
            raise FileNotFoundError('Карточка не найдена')
        if card.local_version != version:
            raise HTTPException(409, 'Карточка уже изменилась. Обновите данные и повторите действие')
        if card.archived:
            raise ValueError('Архивную карточку нельзя переместить')
        columns = list(session.scalars(select(Column).where(Column.board_id == board_id, Column.is_stub.is_(False)).order_by(Column.sort_order, Column.id)))
        def leaves(parent=None, seen=None):
            seen = seen or set()
            result = []
            for column in columns:
                if column.parent_column_id != parent:
                    continue
                if column.id in seen:
                    raise ValueError('Некорректная структура колонок')
                nested = leaves(column.id, seen | {column.id})
                result.extend(nested or [column])
            return result
        ordered = leaves()
        index = next((i for i, col in enumerate(ordered) if col.id == card.column_id), -1)
        if index < 0 or index + 1 >= len(ordered):
            raise ValueError('Следующей колонки нет')
        target = ordered[index + 1]
        last = session.scalar(select(func.max(Card.sort_order)).where(Card.board_id == board_id, Card.column_id == target.id,
            Card.lane_id == card.lane_id, Card.archived.is_(False), Card.deleted_at.is_(None)))
        with localcontext() as context:
            context.prec = 80
            order = (last or Decimal(0)) + 1
        if abs(order) >= Decimal(10) ** 25:
            raise ValueError('Нет свободной позиции в колонке')
        now = datetime.now(timezone.utc)
        card.column_id, card.sort_order, card.last_moved_at = target.id, order, now
        card.local_version += 1
        session.add(CardLocationHistory(card_id=card.id, board_id=board_id, column_id=target.id, lane_id=card.lane_id, changed_at=now, author_id=actor))
        return {'id': card.id}


def add_comment(engine, card_id, request_id, text, files, upload_root, actor=None):
    fingerprint = hashlib.sha256(json.dumps([text, [(name, hashlib.sha256(data).hexdigest()) for name, data, mime in files]], ensure_ascii=False).encode()).hexdigest()
    written = []
    try:
        with Session(engine) as session, session.begin():
            card = session.scalar(select(Card).where(Card.id == card_id).with_for_update())
            if card is None or card.is_stub or card.deleted_at is not None:
                raise FileNotFoundError('Карточка не найдена')
            identifier = uuid5(card_id, f'local-comment:{request_id}')
            previous = session.get(Comment, identifier)
            if previous:
                if previous.extra.get('fingerprint') != fingerprint or previous.author_id != actor:
                    raise ValueError('Этот запрос уже использован для другого комментария')
                return {'id': previous.id}
            if card.archived:
                raise ValueError('Нельзя добавить комментарий в архивную карточку')
            session.add(Comment(id=identifier, card_id=card_id, author_id=actor, text=text, text_format=1, extra={'local': True, 'fingerprint': fingerprint}))
            session.flush()
            for name, data, mime in files:
                file_id = uuid4()
                upload_root.mkdir(parents=True, exist_ok=True)
                path = upload_root / str(file_id)
                with path.open('xb') as stream:
                    written.append(path)
                    stream.write(data)
                obj = FileObject(id=file_id, storage_key=f'local-upload:{file_id}', size=len(data), mime_type=mime,
                    sha256=hashlib.sha256(data).hexdigest(), hash_verified=True)
                session.add(obj)
                session.flush()
                session.add(Attachment(card_id=card_id, comment_id=identifier, file_object_id=file_id, name=name, status='saved', author_id=actor))
            card.local_version += 1
            return {'id': identifier}
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise
