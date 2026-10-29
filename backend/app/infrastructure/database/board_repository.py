"""Thin working-board projections: structure, paged card previews and image metadata."""
import base64
import json
import re
from decimal import Decimal, localcontext
from uuid import UUID, uuid5
from sqlalchemy import select, and_, or_, func, cast, String
from sqlalchemy.orm import Session
from .board_models import Board, Column, Lane, Card, CardTag, Tag, Attachment, FileObject


BOARD_FIELDS = (Board.id, Board.title, Board.description, Board.source_id)
IMAGE_MIMES = ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp')


def decode_cursor(cursor):
    if cursor is None:
        return None
    try:
        order, identifier = json.loads(base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)))
        if not isinstance(identifier, str) or not isinstance(order, str) or not re.fullmatch(r'-?\d{1,25}(?:\.\d{1,25})?', order):
            raise ValueError()
        return Decimal(order), UUID(identifier)
    except (ValueError, TypeError, UnicodeError) as error:
        raise ValueError('Неверный указатель страницы карточек') from error


def encode_cursor(row):
    data = json.dumps([format(row['sort_order'], 'f'), str(row['id'])]).encode()
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def summary(board):
    return {'id': board['id'], 'title': board['title'], 'description': board['description'],
            'sourceId': str(board['source_id']) if board['source_id'] is not None else None}


class SqlBoardRepository:
    def __init__(self, engine):
        self.engine = engine

    def list_boards(self):
        with Session(self.engine) as session:
            rows = session.execute(select(*BOARD_FIELDS).where(Board.is_stub.is_(False)).order_by(Board.created_at, Board.id)).mappings()
            return [summary(row) for row in rows]

    def structure(self, board_id):
        with Session(self.engine) as session:
            board = session.execute(select(*BOARD_FIELDS).where(Board.id == board_id, Board.is_stub.is_(False))).mappings().first()
            if board is None:
                raise FileNotFoundError('Доска не найдена')
            columns = session.execute(select(Column.id, Column.title, Column.parent_column_id, Column.sort_order, Column.type, Column.wip_limit)
                .where(Column.board_id == board_id, Column.is_stub.is_(False)).order_by(Column.sort_order, Column.id)).mappings()
            lanes = session.execute(select(Lane.id, Lane.title, Lane.sort_order)
                .where(Lane.board_id == board_id, Lane.is_stub.is_(False)).order_by(Lane.sort_order, Lane.id)).mappings()
            return {'board': summary(board), 'columns': [
                {'id': row['id'], 'title': row['title'], 'parentId': row['parent_column_id'],
                 'sortOrder': str(row['sort_order']), 'type': row['type'], 'wipLimit': row['wip_limit']} for row in columns],
                'lanes': [{'id': row['id'], 'title': row['title'], 'sortOrder': str(row['sort_order'])} for row in lanes]}

    def cards(self, board_id, column_id, lane_id, limit=30, cursor=None, archived=False, query='', tag_id=None):
        position = decode_cursor(cursor)
        with Session(self.engine) as session:
            valid_column = select(Column.id).join(Board, Board.id == Column.board_id).where(
                Board.id == board_id, Board.is_stub.is_(False), Column.id == column_id, Column.is_stub.is_(False))
            if session.scalar(valid_column) is None:
                raise FileNotFoundError('Доска или колонка не найдена')
            if lane_id is not None and session.scalar(select(Lane.id).where(
                    Lane.id == lane_id, Lane.board_id == board_id, Lane.is_stub.is_(False))) is None:
                raise FileNotFoundError('Дорожка не найдена')
            statement = select(Card.id, Card.display_number, Card.title, Card.column_id, Card.lane_id,
                Card.sort_order, Card.local_version, Card.asap).where(
                    Card.board_id == board_id, Card.column_id == column_id, Card.lane_id == lane_id,
                    Card.is_stub.is_(False), Card.archived.is_(archived), Card.deleted_at.is_(None))
            for identifier in set(tag_id or []):
                statement = statement.where(Card.id.in_(select(CardTag.card_id).where(CardTag.tag_id == identifier)))
            term = query.strip().lower()
            if term:
                matching_tag = select(CardTag.card_id).join(Tag, Tag.id == CardTag.tag_id).where(
                    func.lower(Tag.name).contains(term, autoescape=True))
                statement = statement.where(or_(func.lower(Card.title).contains(term, autoescape=True),
                    cast(Card.display_number, String).contains(term.lstrip('#'), autoescape=True) if term.lstrip('#') else False,
                    Card.id.in_(matching_tag)))
            if position:
                order, identifier = position
                statement = statement.where(or_(Card.sort_order > order, and_(Card.sort_order == order, Card.id > identifier)))
            rows = list(session.execute(statement.order_by(Card.sort_order, Card.id).limit(limit + 1)).mappings())
            has_more = len(rows) > limit
            rows = rows[:limit]
            ids = [row['id'] for row in rows]
            tags, covers = {}, {}
            if ids:
                tag_rows = session.execute(select(CardTag.card_id, Tag.id, Tag.name, Tag.color).join(Tag, Tag.id == CardTag.tag_id)
                    .where(CardTag.card_id.in_(ids), Tag.is_stub.is_(False)).order_by(Tag.name, Tag.id)).mappings()
                for tag in tag_rows:
                    tags.setdefault(tag['card_id'], []).append({'id': tag['id'], 'name': tag['name'], 'color': tag['color']})
                ranked = select(Attachment.card_id, Attachment.id, Attachment.name, Attachment.card_cover,
                    func.row_number().over(partition_by=Attachment.card_id,
                        order_by=(Attachment.card_cover.desc(), Attachment.sort_order, Attachment.id)).label('rank'))\
                    .join(FileObject, FileObject.id == Attachment.file_object_id).where(
                        Attachment.card_id.in_(ids), Attachment.deleted.is_(False), Attachment.status == 'saved',
                        Attachment.is_stub.is_(False), FileObject.mime_type.in_(IMAGE_MIMES),
                        or_(Attachment.card_cover.is_(True), and_(Attachment.comment_id.is_(None), Attachment.property_id.is_(None)))).subquery()
                for cover in session.execute(select(ranked).where(ranked.c.rank == 1)).mappings():
                    covers[cover['card_id']] = {'id': cover['id'], 'name': cover['name'],
                        'url': f"/api/v1/attachments/{cover['id']}/image", 'explicit': cover['card_cover']}
            return {'items': [{'id': row['id'], 'number': str(row['display_number']) if row['display_number'] is not None else None,
                'title': row['title'], 'columnId': row['column_id'], 'laneId': row['lane_id'], 'sortOrder': str(row['sort_order']),
                'version': row['local_version'], 'asap': row['asap'], 'tags': tags.get(row['id'], []),
                'cover': covers.get(row['id'])} for row in rows],
                'nextCursor': encode_cursor(rows[-1]) if has_more else None}

    def image(self, attachment_id):
        with Session(self.engine) as session:
            row = session.execute(select(Attachment.name, FileObject.storage_key, FileObject.mime_type)
                .join(FileObject, FileObject.id == Attachment.file_object_id).where(
                    Attachment.id == attachment_id, Attachment.deleted.is_(False), Attachment.is_stub.is_(False),
                    Attachment.status == 'saved', FileObject.mime_type.in_(IMAGE_MIMES))).mappings().first()
            if row is None:
                raise FileNotFoundError('Изображение не найдено')
            return {'name': row['name'], 'storageKey': row['storage_key'], 'mime': row['mime_type']}

    def file(self, attachment_id):
        with Session(self.engine) as session:
            row = session.execute(select(Attachment.name, FileObject.storage_key, FileObject.mime_type)
                .join(FileObject, FileObject.id == Attachment.file_object_id).where(Attachment.id == attachment_id,
                    Attachment.deleted.is_(False), Attachment.is_stub.is_(False), Attachment.status == 'saved')).mappings().first()
            if row is None:
                raise FileNotFoundError('Файл не найден')
            return {'name': row['name'], 'storageKey': row['storage_key'], 'mime': row['mime_type'] or 'application/octet-stream'}

    def detail(self, card_id):
        from .card_details import read_card_details
        return read_card_details(self.engine, card_id)

    def create_card(self, board_id, title, column_id, lane_id, request_id):
        with Session(self.engine) as session, session.begin():
            board = session.scalar(select(Board).where(Board.id == board_id, Board.is_stub.is_(False)).with_for_update())
            if board is None:
                raise FileNotFoundError('Доска не найдена')
            identifier = uuid5(board_id, f'local-create:{request_id}')
            previous = session.get(Card, identifier)
            if previous is not None:
                if previous.title != title or previous.column_id != column_id or previous.lane_id != lane_id or previous.deleted_at is not None:
                    raise ValueError('Этот запрос уже использован для другой карточки')
                return {'id': previous.id}
            column = session.scalar(select(Column).where(Column.id == column_id, Column.board_id == board_id, Column.is_stub.is_(False)))
            if column is None:
                raise ValueError('Выберите колонку этой доски')
            if session.scalar(select(Column.id).where(Column.parent_column_id == column_id, Column.is_stub.is_(False)).limit(1)):
                raise ValueError('Выберите конечную подколонку')
            if lane_id is not None:
                if session.scalar(select(Lane.id).where(Lane.id == lane_id, Lane.board_id == board_id, Lane.is_stub.is_(False))) is None:
                    raise ValueError('Выберите дорожку этой доски')
            elif session.scalar(select(Lane.id).where(Lane.board_id == board_id, Lane.is_stub.is_(False)).limit(1)):
                raise ValueError('Выберите дорожку')
            last = session.scalar(select(func.max(Card.sort_order)).where(Card.board_id == board_id, Card.column_id == column_id,
                Card.lane_id == lane_id, Card.archived.is_(False), Card.deleted_at.is_(None)))
            with localcontext() as context:
                context.prec = 80
                order = (last if last is not None else Decimal(0)) + 1
            if abs(order) >= Decimal(10) ** 25:
                raise ValueError('Нет свободной позиции в колонке')
            card = Card(id=identifier, board_id=board_id, column_id=column_id, lane_id=lane_id, title=title, sort_order=order,
                type_id=board.default_card_type_id)
            session.add(card); session.flush()
            return {'id': card.id}
