"""Working board structure endpoints must be independent of JSON archives."""
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from backend.app.cli import migrate
from backend.app.core.settings import Settings
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.board_repository import SqlBoardRepository
from backend.app.infrastructure.database.board_models import Board, Column, Lane
from backend.app.main import create_app


class BoardApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.url = f'sqlite:///{(root / "board.db").as_posix()}'
        migrate(self.url)
        self.engine = make_engine(self.url)
        self.board_id, self.other_board = uuid4(), uuid4()
        self.parent, self.child, self.second = uuid4(), uuid4(), uuid4()
        with Session(self.engine) as session, session.begin():
            session.add_all([Board(id=self.board_id, title='Производство', source_id=9007199254740993,
                                   source_data={'never_expose': 'private'}), Board(id=self.other_board, title='Неполная', is_stub=True)])
            session.flush()
            session.add_all([
                Column(id=self.parent, board_id=self.board_id, title='Печать', sort_order=Decimal('1.01')),
                Column(id=self.second, board_id=self.board_id, title='Готово', sort_order=Decimal('2.01'), wip_limit=5),
                Column(board_id=self.board_id, title='Старая колонка', is_stub=True),
                Lane(board_id=self.board_id, title='Обычные', sort_order=2),
                Lane(board_id=self.board_id, title='Срочные', sort_order=1),
            ])
            session.flush()
            session.add(Column(id=self.child, board_id=self.board_id, parent_column_id=self.parent,
                               title='В процессе', sort_order=Decimal('1.02')))
        settings = Settings(backup_root=root / 'no-json-archive', database_url=self.url)
        self.app = create_app(settings=settings, board_repository=SqlBoardRepository(self.engine))
        self.client = TestClient(self.app, base_url='http://127.0.0.1')

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.temp.cleanup()

    def test_lists_real_boards_and_preserves_large_source_ids_as_strings(self):
        result = self.client.get('/api/v1/boards')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()), 1)
        self.assertEqual(result.json()[0]['sourceId'], '9007199254740993')
        self.assertNotIn('source_data', result.json()[0])

    def test_structure_has_sorted_columns_subcolumns_and_lanes(self):
        response = self.client.get(f'/api/v1/boards/{self.board_id}/structure')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([col['title'] for col in payload['columns']], ['Печать', 'В процессе', 'Готово'])
        self.assertEqual(payload['columns'][1]['parentId'], str(self.parent))
        self.assertIsInstance(payload['columns'][0]['sortOrder'], str)
        self.assertEqual(payload['columns'][2]['wipLimit'], 5)
        self.assertEqual([lane['title'] for lane in payload['lanes']], ['Срочные', 'Обычные'])

    def test_does_not_read_json_card_payloads_or_raw_source_columns(self):
        statements = []
        def capture(connection, cursor, statement, parameters, context, many):
            statements.append(statement.lower())
        event.listen(self.engine, 'before_cursor_execute', capture)
        try:
            with patch('backend.app.infrastructure.archive.repository.ArchiveRepository.dictionaries', side_effect=AssertionError('No JSON reads')):
                self.assertEqual(self.client.get(f'/api/v1/boards/{self.board_id}/structure').status_code, 200)
            self.assertEqual(len(statements), 3)
            self.assertFalse(any('archive_' in sql or 'source_data' in sql or 'from cards' in sql for sql in statements))
        finally:
            event.remove(self.engine, 'before_cursor_execute', capture)

    def test_unknown_stub_and_invalid_board_ids(self):
        for board in (uuid4(), self.other_board):
            self.assertEqual(self.client.get(f'/api/v1/boards/{board}/structure').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/boards/invalid/structure').status_code, 422)

    def test_board_without_columns_is_valid(self):
        with Session(self.engine) as session, session.begin():
            empty = Board(id=uuid4(), title='Новая'); session.add(empty); empty_id = empty.id
        self.assertEqual(self.client.get(f'/api/v1/boards/{empty_id}/structure').json()['columns'], [])


if __name__ == '__main__':
    unittest.main()
