"""Offline updater integration tests against disposable fixture databases."""
import contextlib
import io
import json
import os
import tempfile
import unittest
import uuid
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from backend.app.application.update_board import update_board, import_lock
from backend.app.cli import migrate
from backend.app.infrastructure.archive.repository import ArchiveRepository
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.models import ArchiveCard
from backend.app.infrastructure.database import board_models as m
from backend.app.update_database import main


class UpdateBoardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.snapshot = 'fixture'
        self.folder = self.root / 'backups' / self.snapshot
        (self.folder / 'board').mkdir(parents=True)
        self.url = f'sqlite:///{(self.root / "test.db").as_posix()}'
        self.admin = None
        if os.getenv('BOARD_TEST_DATABASE_URL'):
            from sqlalchemy.engine import make_url
            from backend.app.core.settings import Settings
            url = os.environ['BOARD_TEST_DATABASE_URL']
            if url == 'from-settings':
                url = Settings.from_env().database_url
            self.admin = make_engine(url)
            self.schema = 'test_updater_' + uuid.uuid4().hex
            with self.admin.begin() as connection:
                connection.execute(CreateSchema(self.schema))
            self.url = make_url(url).update_query_dict({'options': f'-csearch_path={self.schema}'}).render_as_string(hide_password=False)
        migrate(self.url)
        self.engine = make_engine(self.url)
        self.write('report.json', {'origin': 'https://company.kaiten.ru', 'status': 'complete', 'board_id': 7,
                                  'cards_saved': 1, 'selected': [], 'issues': []})
        self.write('board/board.json', {'id': 7, 'title': 'Заказы', 'default_card_type_id': 3})
        self.write('board/types.json', [{'id': 3, 'name': 'Заказ'}])
        self.write('board/columns.json', [{'id': 5, 'board_id': 7, 'title': 'В работе'}])
        self.write('board/subcolumns_5.json', [{'id': 6, 'board_id': 7, 'title': 'Печать'}])
        self.write('board/lanes.json', [{'id': 8, 'board_id': 7, 'title': 'Общая'}])
        self.write('board/users.json', [{'id': 9, 'full_name': 'Текущее имя', 'updated': '2026-10-20T00:00:00Z'}])
        self.write('board/tags.json', [{'id': 11, 'name': 'Важный'}])
        self.write('board/fields.json', [{'id': 12, 'name': 'Цвет', 'type': 'select'}])
        self.write('board/field_values_12.json', [{'id': 13, 'value': 'Синий'}])
        self.card = {'id': 123, 'title': 'Заказ', 'description': 'Описание', 'board_id': 7, 'column_id': 5,
                     'subcolumn_id': 6, 'lane_id': 8, 'owner_id': 9, 'type_id': 3, 'version': 1,
                     'updated': '2026-10-21T00:00:00Z', 'sort_order': '123.1234567890',
                     'tags': [{'id': 1001, 'tag_id': 11, 'name': 'Важный'}], 'properties': {'id_12': [13]},
                     'children_ids': [456], 'future_field': {'keep': True},
                     'files': [{'id': 'file-uuid', 'name': 'f.txt', 'comment_id': 14, 'author_id': 9}]}
        self.save_card()
        self.write('cards/123/members.json', [{'id': 1501, 'user_id': 9, 'full_name': 'Старое имя', 'type': 2}])
        self.write('cards/123/comments.json', [{'id': 14, 'card_id': 123, 'author_id': 9, 'text': 'Комментарий', 'type': 2}])
        self.write('cards/123/checklist_15.json', {'id': 15, 'name': 'Проверить', 'items': [{'id': 16, 'text': 'Пункт', 'checked': True, 'checker_id': 9}]})
        self.write('cards/123/history.json', [{'id': 'historic', 'board_id': 7, 'column_id': 99, 'author_id': 9,
                                             'author': {'id': 9, 'full_name': 'Историческое имя'}, 'changed': '2020-01-01T00:00:00Z'}])
        self.write('cards/123/activity.json', [{'id': 'event-uuid', 'author_id': 9, 'action': 'card_update',
                                              'created': '2026-01-01T00:00:00Z', 'data': {'title': 'В прошлом'}}])
        self.write('cards/123/future.json', {'unknown': ['retained']})
        self.write('cards/123/files.json', [{'id': 'file-uuid', 'name': 'f.txt', 'status': 'saved', 'size': 3,
                                           'path': 'cards/123/files/f.txt'}])
        (self.folder / 'cards/123/files').mkdir()
        (self.folder / 'cards/123/files/f.txt').write_bytes(b'abc')

    def tearDown(self):
        self.engine.dispose()
        if self.admin is not None:
            with self.admin.begin() as connection:
                connection.execute(DropSchema(self.schema, cascade=True))
            self.admin.dispose()
        self.temp.cleanup()

    def write(self, name, value):
        path = self.folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

    def save_card(self):
        self.write('cards/123/card.json', self.card)

    def run_update(self, **kwargs):
        source = ArchiveRepository(self.root / 'backups')
        return update_board(source, self.engine, self.snapshot, card_ids=[123], **kwargs)

    def test_normalization_is_repeatable_and_lossless(self):
        first = self.run_update(verify_files=True)
        self.assertEqual(first['errors'], [])
        self.assertEqual(first['saved'], 1)
        self.assertEqual(first['conflicts'], [])
        with Session(self.engine) as session:
            counts = {model: session.scalar(select(func.count()).select_from(model)) for model in
                      (m.Card, m.User, m.CardMember, m.Tag, m.CardTag, m.Comment, m.Checklist, m.ChecklistItem,
                       m.Attachment, m.FileObject, m.ActivityEvent, m.CardLocationHistory, m.CardRelation)}
            card = session.scalar(select(m.Card).where(m.Card.source_id == 123)); uid = card.id
            self.assertLess(abs(card.sort_order - Decimal('123.1234567890')), Decimal('1e-10'))
            self.assertEqual(session.get(m.Column, card.column_id).source_id, 6)
            self.assertEqual(session.scalar(select(m.User)).full_name, 'Текущее имя')
            tag = session.scalar(select(m.CardTag))
            self.assertEqual(session.get(m.Tag, tag.tag_id).source_id, 11)
            self.assertEqual(tag.source_assignment_id, 1001)
            file = session.scalar(select(m.FileObject))
            self.assertTrue(file.hash_verified)
            self.assertEqual(file.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
            raw = session.get(ArchiveCard, (self.snapshot, 123)).raw
            self.assertEqual(raw['future.json'], {'unknown': ['retained']})
            stub = session.scalar(select(m.Card).where(m.Card.source_id == 456))
            self.assertTrue(stub.is_stub)
            self.assertNotEqual(stub.board_id, card.board_id)
        self.assertEqual(self.run_update(verify_files=True)['errors'], [])
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(m.Card).where(m.Card.source_id == 123)).id, uid)
            for model, count in counts.items():
                self.assertEqual(session.scalar(select(func.count()).select_from(model)), count)

    def test_updates_current_values_but_missing_sections_do_not_delete_data(self):
        self.run_update()
        self.card.update(title='Новое название', version=2, updated='2026-10-22T00:00:00Z', tags=[])
        self.card.pop('properties'); self.save_card()
        (self.folder / 'cards/123/comments.json').unlink()
        (self.folder / 'cards/123/members.json').unlink()
        self.assertEqual(self.run_update()['saved'], 1)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(m.Card).where(m.Card.source_id == 123)).title, 'Новое название')
            self.assertEqual(session.scalar(select(func.count()).select_from(m.CardTag)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(m.Comment)), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(m.CardMember)), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(m.CardPropertyValue)), 1)
            self.assertEqual(session.get(ArchiveCard, (self.snapshot, 123)).raw['comments.json'][0]['text'], 'Комментарий')

    def test_old_snapshot_and_local_edits_are_not_overwritten(self):
        self.run_update()
        self.card.update(title='Старый снимок', version=0, updated='2020-01-01T00:00:00Z'); self.save_card()
        result = self.run_update(); self.assertEqual(len(result['conflicts']), 1)
        self.assertEqual(result['saved'], 0)
        self.card.update(title='Источник', version=2, updated='2026-10-22T00:00:00Z'); self.save_card()
        with Session(self.engine) as session, session.begin():
            card = session.scalar(select(m.Card).where(m.Card.source_id == 123)); card.title = 'Локально'; card.local_version = 2
        self.assertEqual(len(self.run_update()['conflicts']), 1)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(m.Card).where(m.Card.source_id == 123)).title, 'Локально')
        self.assertEqual(self.run_update(overwrite_local=True)['saved'], 1)

    def test_invalid_card_rolls_back_its_relations_and_other_cards_continue(self):
        self.card['children_ids'] = [123]; self.save_card()
        self.write('cards/200/card.json', {'id': 200, 'title': 'Корректная', 'board_id': 7})
        result = update_board(ArchiveRepository(self.root / 'backups'), self.engine, self.snapshot,
                              card_ids=[123, 200], batch_size=2)
        self.assertEqual(result['saved'], 1)
        self.assertEqual(len(result['errors']), 1)
        with Session(self.engine) as session:
            self.assertIsNone(session.scalar(select(m.Card).where(m.Card.source_id == 123)))
            self.assertIsNone(session.get(ArchiveCard, (self.snapshot, 123)))
            self.assertEqual(session.scalar(select(func.count()).select_from(m.CardRelation)), 0)
            self.assertIsNotNone(session.scalar(select(m.Card).where(m.Card.source_id == 200)))

    def test_damaged_file_is_recorded_without_losing_card(self):
        (self.folder / 'cards/123/files/f.txt').write_bytes(b'bad file size')
        result = self.run_update(verify_files=True)
        self.assertEqual(result['saved'], 1)
        self.assertTrue(result['warnings'])
        with Session(self.engine) as session:
            attachment = session.scalar(select(m.Attachment))
            self.assertEqual(attachment.status, 'missing')
            self.assertIsNone(attachment.file_object_id)

    def test_plan_does_not_connect_or_create_database_and_report_is_outside_source(self):
        unused = self.root / 'never-created.db'
        env = {'BOARD_BACKUP_ROOT': str(self.root / 'backups'), 'BOARD_DATABASE_URL': f'sqlite:///{unused.as_posix()}'}
        with patch.dict('os.environ', env), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(main(['--snapshot', self.snapshot, '--card-id', '123', '--plan']), 0)
        self.assertEqual(json.loads(out.getvalue())['status'], 'plan')
        self.assertFalse(unused.exists())
        with patch.dict('os.environ', env), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(['--snapshot', self.snapshot, '--plan', '--report', str(self.folder / 'danger.json')]), 1)
        self.assertFalse((self.folder / 'danger.json').exists())

    def test_historical_location_does_not_change_current_column(self):
        self.write('cards/123/history.json', [{'id': 'moved-column', 'board_id': 999, 'column_id': 5,
                                             'changed': '2020-01-01T00:00:00Z'}])
        result = self.run_update()
        self.assertEqual(result['errors'], [])
        with Session(self.engine) as session:
            column = session.scalar(select(m.Column).where(m.Column.source_id == 5))
            self.assertEqual(session.get(m.Board, column.board_id).source_id, 7)
            event = session.scalar(select(m.CardLocationHistory))
            self.assertEqual(session.get(m.Board, event.board_id).source_id, 999)

    def test_relation_cycle_across_cards_is_rejected(self):
        self.run_update()
        self.write('cards/456/card.json', {'id': 456, 'title': 'Дочерняя', 'board_id': 7, 'children_ids': [123]})
        result = update_board(ArchiveRepository(self.root / 'backups'), self.engine, self.snapshot, card_ids=[456])
        self.assertEqual(len(result['errors']), 1)
        self.assertEqual(result['saved'], 0)

    def test_corrupt_secondary_section_does_not_erase_existing_comments(self):
        self.run_update()
        (self.folder / 'cards/123/comments.json').write_text('{broken', encoding='utf-8')
        self.assertEqual(self.run_update()['saved'], 1)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(m.Comment)).text, 'Комментарий')

    def test_one_card_failure_does_not_rollback_previous_batches(self):
        self.write('cards/300/card.json', {'id': 300, 'title': 'Сохранить', 'board_id': 7})
        self.write('cards/200/card.json', {'id': 999, 'title': 'Неверный ID', 'board_id': 7})
        result = update_board(ArchiveRepository(self.root / 'backups'), self.engine, self.snapshot,
                              card_ids=[300, 200], batch_size=1)
        self.assertEqual(result['saved'], 1)
        self.assertEqual(len(result['errors']), 1)
        with Session(self.engine) as session:
            self.assertIsNotNone(session.scalar(select(m.Card).where(m.Card.source_id == 300)))

    def test_fractional_sort_order_is_retained_in_postgresql(self):
        self.card['sort_order'] = '1.6870946407001841'; self.save_card()
        self.assertEqual(self.run_update()['saved'], 1)
        with Session(self.engine) as session:
            card = session.scalar(select(m.Card).where(m.Card.source_id == 123))
            self.assertEqual(card.source_data['sort_order'], '1.6870946407001841')
            if self.engine.dialect.name == 'postgresql':
                self.assertEqual(card.sort_order, Decimal('1.6870946407001841'))

    def test_partial_card_does_not_clear_location_owner_or_unknown_fields(self):
        self.run_update()
        self.card = {'id': 123, 'title': 'Только название'}; self.save_card()
        self.assertEqual(self.run_update()['saved'], 1)
        with Session(self.engine) as session:
            card = session.scalar(select(m.Card).where(m.Card.source_id == 123))
            self.assertIsNotNone(card.owner_id)
            self.assertIsNotNone(card.column_id)
            self.assertIsNotNone(card.lane_id)
            self.assertEqual(card.source_data['future_field'], {'keep': True})

    def test_checksum_mismatch_and_path_escape_are_not_accepted(self):
        self.write('cards/123/files.json', [{'id': 'file-uuid', 'name': 'f.txt', 'status': 'saved', 'size': 3,
            'path': 'cards/123/files/f.txt', 'sha256': '0' * 64}])
        self.assertEqual(self.run_update(verify_files=True)['saved'], 1)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(m.Attachment)).status, 'missing')
        self.write('cards/123/files.json', [{'id': 'file-uuid', 'name': 'f.txt', 'status': 'saved', 'size': 3,
                                           'path': '../../outside.txt'}])
        self.assertEqual(self.run_update()['saved'], 1)
        with Session(self.engine) as session:
            self.assertIsNone(session.scalar(select(m.Attachment)).file_object_id)

    def test_postgresql_blocks_a_concurrent_import_for_the_same_company(self):
        if self.engine.dialect.name != 'postgresql':
            self.skipTest('PostgreSQL advisory lock integration')
        with import_lock(self.engine, 'https://company.kaiten.ru'):
            with self.assertRaisesRegex(ValueError, 'уже выполняется'):
                self.run_update()
        self.assertEqual(self.run_update()['saved'], 1)

    def test_enrichment_tracks_sources_without_reading_json_or_creating_logins(self):
        self.run_update()
        from backend.app.application.enrich_existing import enrich_existing
        from backend.app.infrastructure.database.auth_models import SourceRecord
        with patch.object(Path, 'read_text', side_effect=AssertionError('No JSON import')):
            enrich_existing(self.engine)
            enrich_existing(self.engine)
        with Session(self.engine) as session:
            records=list(session.scalars(select(SourceRecord).where(SourceRecord.entity_type=='cards')))
            self.assertEqual(len(records),1)
            self.assertEqual(records[0].relative_path,'cards/123/card.json')
            self.assertEqual(records[0].entity_id,session.scalar(select(m.Card.id).where(m.Card.source_id==123)))
            self.assertEqual(records[0].snapshot_id,self.snapshot)
            self.assertIsNone(session.scalar(select(m.Account)))

    def test_cli_writes_report_without_overwriting_existing_file(self):
        report = self.root / 'result.json'
        env = {'BOARD_BACKUP_ROOT': str(self.root / 'backups'), 'BOARD_DATABASE_URL': self.url}
        args = ['--snapshot', self.snapshot, '--card-id', '123', '--report', str(report)]
        with patch.dict('os.environ', env), contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(args), 0)
        self.assertEqual(json.loads(out.getvalue())['saved'], 1)
        original = report.read_bytes()
        with patch.dict('os.environ', env), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(args), 1)
        self.assertEqual(report.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
