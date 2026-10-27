"""Small structure-only queries: never select card payloads or archive JSON."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from .board_models import Board, Column, Lane


BOARD_FIELDS = (Board.id, Board.title, Board.description, Board.source_id)


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
