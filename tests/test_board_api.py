"""Working board structure endpoints must be independent of JSON archives."""
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from backend.app.cli import migrate
from backend.app.core.settings import Settings
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.board_repository import SqlBoardRepository
from backend.app.infrastructure.database.board_models import Board, Column, Lane, Card, Tag, CardTag, Attachment, FileObject
from backend.app.infrastructure.database import board_models as models
from backend.app.infrastructure.database.models import ArchiveSnapshot, ArchiveCard
from datetime import datetime, timezone
import base64
import json
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
        settings = Settings(auth_required=False, backup_root=root / 'no-json-archive', upload_root=root / 'uploads', database_url=self.url)
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

    def test_filter_options_cover_all_pages_and_archive_without_duplicates_or_private_fields(self):
        from backend.app.infrastructure.database.avatar_models import UserAvatar
        first, second, _ = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            archived = session.scalar(select(Card.id).where(Card.board_id == self.board_id, Card.archived.is_(True)))
            deleted = session.scalar(select(Card.id).where(Card.board_id == self.board_id, Card.deleted_at.is_not(None)))
            stub = session.scalar(select(Card.id).where(Card.board_id == self.board_id, Card.is_stub.is_(True)))
            other = Board(id=uuid4(), title='Другая доска'); session.add(other); session.flush()
            other_card = Card(id=uuid4(), board_id=other.id, title='Чужая'); session.add(other_card); session.flush()
            user_ids, tag_ids = [], []
            for index, card_id in enumerate([second, archived, deleted, stub, other_card.id]):
                user_id, tag_id = uuid4(), uuid4()
                user_ids.append(user_id); tag_ids.append(tag_id)
                session.add_all([models.User(id=user_id, full_name=f'Участник {index}', email='private@example.test'),
                                 Tag(id=tag_id, name=f'Метка {index}', color='16')]); session.flush()
                session.add_all([models.CardMember(card_id=card_id, user_id=user_id, role='member'), CardTag(card_id=card_id, tag_id=tag_id)])
            session.add_all([models.CardMember(card_id=first, user_id=user_ids[0], role='member'),
                             models.CardMember(card_id=second, user_id=user_ids[0], role='owner'),
                             CardTag(card_id=first, tag_id=tag_ids[0])])
            avatar_file = FileObject(id=uuid4(), storage_key='local-upload:avatar', mime_type='image/png', size=4)
            session.add(avatar_file); session.flush()
            session.add(UserAvatar(user_id=user_ids[0], mode='custom', custom_file_id=avatar_file.id))
            expected_avatar = f'/api/v1/users/{user_ids[0]}/avatar?v={avatar_file.id}'
        response = self.client.get(f'/api/v1/boards/{self.board_id}/filter-options')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([item['name'] for item in payload['tags']], ['Метка 0', 'Метка 1', 'Печать'])
        self.assertEqual([item['id'] for item in payload['users']], [str(identifier) for identifier in user_ids[:2]])
        self.assertEqual(payload['users'][0]['avatarUrl'], expected_avatar)
        self.assertNotIn('email', response.text)
        self.assertNotIn('source_data', response.text)

    def test_filter_options_validate_board_and_support_empty_lists(self):
        self.assertEqual(self.client.get(f'/api/v1/boards/{self.board_id}/filter-options').json(), {'tags': [], 'users': []})
        for identifier in [uuid4(), self.other_board]:
            self.assertEqual(self.client.get(f'/api/v1/boards/{identifier}/filter-options').status_code, 404)
        self.assertEqual(self.client.get('/api/v1/boards/invalid/filter-options').status_code, 422)

    def seed_cards(self):
        with Session(self.engine) as session, session.begin():
            lane_id = session.scalar(select(Lane.id).where(Lane.board_id == self.board_id, Lane.title == 'Срочные'))
            first, second = uuid4(), uuid4()
            first, second = sorted([first, second])
            session.add_all([
                Card(id=first, board_id=self.board_id, column_id=self.second, lane_id=lane_id,
                     title='Первый заказ', display_number=9007199254740993, sort_order=0),
                Card(id=second, board_id=self.board_id, column_id=self.second, lane_id=lane_id, title='Второй заказ', sort_order=0),
                Card(board_id=self.board_id, column_id=self.second, lane_id=lane_id, title='Архив', archived=True),
                Card(board_id=self.board_id, column_id=self.second, lane_id=lane_id, title='Удалена', deleted_at=datetime.now(timezone.utc)),
                Card(board_id=self.board_id, column_id=self.second, lane_id=lane_id, title='Заглушка', is_stub=True),
                Card(board_id=self.board_id, column_id=self.parent, lane_id=lane_id, title='Другая колонка'),
            ])
            tag = Tag(id=uuid4(), name='Печать', color='16')
            session.add(tag); session.flush()
            session.add(CardTag(card_id=first, tag_id=tag.id))
        return first, second, lane_id

    def card_page(self, lane_id, **params):
        return self.client.get(f'/api/v1/boards/{self.board_id}/cards', params={
            'column_id': str(self.second), 'lane_id': str(lane_id), **params})

    def test_card_cursor_pagination_excludes_archived_deleted_stubs_and_other_columns(self):
        first, second, lane = self.seed_cards()
        page = self.card_page(lane, limit=1).json()
        self.assertEqual([item['id'] for item in page['items']], [str(first)])
        self.assertEqual(page['items'][0]['number'], '9007199254740993')
        self.assertEqual(page['items'][0]['tags'][0]['color'], '16')
        next_page = self.card_page(lane, limit=1, cursor=page['nextCursor']).json()
        self.assertEqual([item['id'] for item in next_page['items']], [str(second)])
        self.assertIsNone(next_page['nextCursor'])

    def test_cards_validate_scope_and_cursor(self):
        _, _, lane = self.seed_cards()
        for cursor in ('!', 'not-json', base64.urlsafe_b64encode(json.dumps(['0', 123]).encode()).decode()):
            self.assertEqual(self.card_page(lane, cursor=cursor).status_code, 400)
        self.assertEqual(self.card_page(uuid4()).status_code, 404)
        self.assertEqual(self.card_page(lane, limit=101).status_code, 422)
        self.assertEqual(self.client.get(f'/api/v1/boards/{self.other_board}/cards',
            params={'column_id': str(self.second)}).status_code, 404)

    def test_counts_and_user_date_filters_apply_before_pagination(self):
        first, second, lane = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            user = models.User(id=uuid4(), full_name='Анна')
            other = models.User(id=uuid4(), full_name='Иван')
            session.add_all([user, other]); session.flush()
            user_id, other_id = user.id, other.id
            session.add_all([models.CardMember(card_id=first, user_id=user.id, role='member'),
                             models.CardMember(card_id=second, user_id=user.id, role='member'),
                             models.CardMember(card_id=first, user_id=other.id, role='member')])
            session.get(Card, first).due_date = datetime(2026, 10, 30, 20, 59, 59, 999999, tzinfo=timezone.utc)
            session.get(Card, second).due_date = datetime(2026, 10, 30, 21, 0, tzinfo=timezone.utc)
        page = self.card_page(lane, limit=1, user_id=str(user_id)).json()
        self.assertEqual(page['total'], 2)
        self.assertEqual(self.card_page(lane, limit=1, user_id=str(user_id), cursor=page['nextCursor']).json()['total'], 2)
        params = dict(user_id=str(user_id), date_field='due', date_from='2026-10-30', date_to='2026-10-30', timezone_offset=-180)
        result = self.card_page(lane, **params).json()
        self.assertEqual(result['total'], 1)
        self.assertEqual([card['id'] for card in result['items']], [str(first)])
        self.assertEqual(self.card_page(lane, **params, q='Второй').json()['total'], 0)
        self.assertEqual(self.card_page(lane, user_id=[str(user_id), str(other_id)]).json()['total'], 1)
        self.assertEqual(self.card_page(lane, user_id=str(uuid4())).json()['total'], 0)
        self.assertEqual(self.card_page(lane, user_id='invalid').status_code, 422)
        self.assertEqual(self.card_page(lane, date_field='invalid').status_code, 422)
        self.assertEqual(self.card_page(lane, date_from='2026-11-01', date_to='2026-10-01').status_code, 422)
        self.assertEqual(self.card_page(lane, date_from='2026-02-30').status_code, 422)
        self.assertEqual(self.card_page(lane, date_to='2026-10-30', date_field='due').json()['total'], 2)

    def add_image(self, session, card_id, key, **kwargs):
        obj = FileObject(id=uuid4(), storage_key=key, size=4, mime_type=kwargs.pop('mime', 'image/png'))
        attachment = Attachment(id=uuid4(), card_id=card_id, name='Макет', file_object_id=obj.id, status='saved', **kwargs)
        session.add(obj); session.flush(); session.add(attachment)
        return attachment.id

    def test_cover_prefers_explicit_and_falls_back_only_to_usable_card_images(self):
        first, second, lane = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            self.add_image(session, first, 'first.png', sort_order=1)
            explicit = self.add_image(session, first, 'cover.png', card_cover=True, sort_order=10)
            self.add_image(session, second, 'deleted.png', card_cover=True, deleted=True)
            self.add_image(session, second, 'unsafe.svg', card_cover=True, mime='image/svg+xml')
            fallback = self.add_image(session, second, 'fallback.png')
        items = self.card_page(lane).json()['items']
        self.assertEqual(items[0]['cover']['id'], str(explicit))
        self.assertTrue(items[0]['cover']['explicit'])
        self.assertEqual(items[1]['cover']['id'], str(fallback))
        self.assertFalse(items[1]['cover']['explicit'])

    def test_images_use_database_storage_key_and_reject_missing_and_escaping_paths(self):
        first, _, _ = self.seed_cards()
        root = Path(self.temp.name) / 'no-json-archive'; root.mkdir()
        (root / 'cover.png').write_bytes(b'PNG!')
        with Session(self.engine) as session, session.begin():
            good = self.add_image(session, first, 'cover.png')
            escape = self.add_image(session, first, '../board.db')
            missing = self.add_image(session, first, 'missing.png')
        response = self.client.get(f'/api/v1/attachments/{good}/image')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'PNG!')
        self.assertEqual(response.headers['content-type'], 'image/png')
        for identifier in (escape, missing, uuid4()):
            self.assertEqual(self.client.get(f'/api/v1/attachments/{identifier}/image').status_code, 404)

    def test_card_list_does_not_load_raw_json_or_details_and_batches_related_data(self):
        _, _, lane = self.seed_cards()
        statements = []
        def capture(connection, cursor, statement, parameters, context, many):
            statements.append(statement.lower())
        event.listen(self.engine, 'before_cursor_execute', capture)
        try:
            response = self.card_page(lane)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(statements), 7)  # Batched previews plus the complete filtered count.
            self.assertFalse(any('source_data' in sql or 'cards.description' in sql or 'archive_' in sql for sql in statements))
            self.assertNotIn('storageKey', response.text)
        finally:
            event.remove(self.engine, 'before_cursor_execute', capture)

    def test_card_detail_uses_current_rows_and_retained_sql_sections_without_reading_json(self):
        first, second, lane = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            source = models.SourceInstance(id=uuid4(), origin='https://company.kaiten.ru', name='Компания')
            user = models.User(id=uuid4(), full_name='Анна', email='anna@example.test')
            session.add_all([source, user]); session.flush()
            card = session.get(Card, first)
            card.owner_id = user.id; card.source_instance_id = source.id; card.source_id = 42
            card.description = '**Текущее описание**'; card.source_data = {'unmapped': 'Не потерять'}
            session.add(models.CardMember(card_id=first, user_id=user.id, role=2))
            comment = models.Comment(id=uuid4(), card_id=first, author_id=user.id, text='Актуальный комментарий')
            checklist = models.Checklist(id=uuid4(), name='Упаковка')
            session.add_all([comment, checklist]); session.flush()
            session.add(models.CardChecklist(card_id=first, checklist_id=checklist.id))
            session.add(models.ChecklistItem(checklist_id=checklist.id, text='Проверить коробку', checked=True))
            session.add(models.CardRelation(parent_card_id=first, child_card_id=second))
            self.add_image(session, first, 'detail.png', comment_id=comment.id)
            session.add(ArchiveSnapshot(id='snapshot', summary={'origin': source.origin}, dictionaries={}))
            session.flush()
            session.add(ArchiveCard(snapshot_id='snapshot', card_id=42, title='Старое название', search_text='',
                raw={'card.json': {'title': 'Старое название'}, 'time-logs.json': [{'minutes': 12}]}, diagnostics=['Файл не скачан']))
            session.add(ArchiveSnapshot(id='zz-other-company', summary={'origin': 'https://other.kaiten.ru'}, dictionaries={}))
            session.flush()
            session.add(ArchiveCard(snapshot_id='zz-other-company', card_id=42, title='Другая компания', search_text='',
                raw={'time-logs.json': [{'minutes': 999}]}, diagnostics=[]))
        with patch('backend.app.infrastructure.archive.repository.ArchiveRepository.load_card', side_effect=AssertionError('No disk reads')):
            response = self.client.get(f'/api/v1/cards/{first}/detail')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['card']['title'], 'Первый заказ')
        self.assertEqual(data['card']['description'], '**Текущее описание**')
        self.assertEqual(data['members'][0]['name'], 'Анна')
        self.assertEqual(data['comments'][0]['text'], 'Актуальный комментарий')
        self.assertTrue(data['checklists'][0]['items'][0]['checked'])
        self.assertEqual(data['children'][0]['id'], str(second))
        self.assertEqual(data['extras']['time-logs.json'][0]['minutes'], 12)
        self.assertEqual(data['source']['diagnostics'], ['Файл не скачан'])
        self.assertEqual(data['raw']['working-card-source']['unmapped'], 'Не потерять')
        self.assertEqual(data['files'][0]['commentId'], data['comments'][0]['id'])
        self.assertNotIn('storageKey', response.text)

    def test_detail_rejects_unknown_stub_deleted_and_keeps_archived_cards_readable(self):
        first, _, lane = self.seed_cards()
        self.assertEqual(self.client.get(f'/api/v1/cards/{uuid4()}/detail').status_code, 404)
        with Session(self.engine) as session:
            for title in ('Архив', 'Заглушка', 'Удалена'):
                identifier = session.scalar(select(Card.id).where(Card.title == title))
                response = self.client.get(f'/api/v1/cards/{identifier}/detail')
                self.assertEqual(response.status_code, 200 if title == 'Архив' else 404)
        self.assertEqual(self.client.get('/api/v1/cards/not-a-uuid/detail').status_code, 422)

    def test_content_download_keeps_active_formats_as_attachments(self):
        first, _, _ = self.seed_cards()
        root = Path(self.temp.name) / 'no-json-archive'; root.mkdir()
        (root / 'file.html').write_text('<script>test</script>')
        with Session(self.engine) as session, session.begin():
            identifier = self.add_image(session, first, 'file.html', mime='text/html')
        response = self.client.get(f'/api/v1/attachments/{identifier}/content')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers['content-disposition'].startswith('attachment'))

    def test_board_search_covers_russian_titles_numbers_tags_and_literal_wildcards(self):
        first, second, lane = self.seed_cards()
        for query in ('ПЕРВЫЙ', '#9007199254740993', 'ПЕЧАТЬ'):
            response = self.card_page(lane, q=query)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([item['id'] for item in response.json()['items']], [str(first)])
        for query in ('%', '_', 'нет совпадений'):
            self.assertEqual(self.card_page(lane, q=query).json()['items'], [])
        self.assertEqual(self.card_page(lane, q='x' * 201).status_code, 422)

    def test_exact_tag_filter_combines_with_search_archive_and_pagination(self):
        first, second, lane = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            tag_id = session.scalar(select(Tag.id).where(Tag.name == 'Печать'))
            session.get(Card, second).title = 'Печать без метки'
            archived = session.scalar(select(Card.id).where(Card.title == 'Архив'))
            session.add(CardTag(card_id=archived, tag_id=tag_id))
        self.assertEqual([item['id'] for item in self.card_page(lane, tag_id=str(tag_id), limit=1).json()['items']], [str(first)])
        self.assertIsNone(self.card_page(lane, tag_id=str(tag_id), limit=1).json()['nextCursor'])
        self.assertEqual(self.card_page(lane, tag_id=str(tag_id), q='нет совпадений').json()['items'], [])
        self.assertEqual([item['id'] for item in self.card_page(lane, tag_id=str(tag_id), archived='true', q='архив').json()['items']], [str(archived)])
        self.assertEqual(self.card_page(lane, tag_id=str(uuid4())).json()['items'], [])
        self.assertEqual(self.card_page(lane, tag_id='not-a-uuid').status_code, 422)
        with Session(self.engine) as session, session.begin():
            second_tag = Tag(id=uuid4(), name='Вторая', color='1')
            session.add(second_tag)
            session.flush()
            second_tag_id = second_tag.id
            session.add(CardTag(card_id=second, tag_id=second_tag_id))
        self.assertEqual(self.card_page(lane, tag_id=[str(tag_id), str(second_tag_id)]).json()['items'], [])
        with Session(self.engine) as session, session.begin():
            session.add(CardTag(card_id=first, tag_id=second_tag_id))
        self.assertEqual([item['id'] for item in self.card_page(lane, tag_id=[str(tag_id), str(second_tag_id)]).json()['items']], [str(first)])

    def test_working_archive_is_filtered_separately_from_active_cards(self):
        first, second, lane = self.seed_cards()
        response = self.card_page(lane, archived='true', q='АРХИВ')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['title'] for item in response.json()['items']], ['Архив'])
        self.assertEqual(self.card_page(lane, q='Архив').json()['items'], [])

    def test_move_inserts_between_equal_positions_and_preserves_hidden_cards(self):
        first, second, lane = self.seed_cards()
        moving = uuid4()
        with Session(self.engine) as session, session.begin():
            session.add(Card(id=moving, board_id=self.board_id, column_id=self.child, lane_id=lane, title='Перенос'))
        url = f'/api/v1/cards/{moving}/move'
        body = {'version': 1, 'columnId': str(self.second), 'laneId': str(lane), 'afterCardId': str(first)}
        result = self.client.post(url, json=body)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual([item['id'] for item in self.card_page(lane).json()['items']], [str(first), str(moving), str(second)])
        self.assertEqual(self.client.post(url, json=body).status_code, 409)
        with Session(self.engine) as session:
            self.assertEqual(session.get(Card, moving).local_version, 2)
            self.assertEqual(len(list(session.scalars(select(models.CardLocationHistory).where(models.CardLocationHistory.card_id == moving)))), 1)

    def test_edit_existing_card_updates_details_board_and_activity_without_changing_source(self):
        first, second, lane = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            card = session.get(Card, first)
            card.source_data = {'title': 'Оригинал', 'description': '<p>Исходник</p>'}
            card.source_updated_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
            number, position = card.display_number, card.sort_order
        result = self.client.post(f'/api/v1/cards/{first}/edit', json={
            'version': 1, 'title': '  Уточнённый заказ  ', 'description': '<p>Новые подробности</p>',
            'asap': True, 'dueDate': '2026-11-10T20:59:59.999Z'})
        self.assertEqual(result.status_code, 200, result.text)
        detail = self.client.get(f'/api/v1/cards/{first}/detail').json()
        self.assertEqual(detail['card']['title'], 'Уточнённый заказ')
        self.assertEqual(detail['card']['description'], '<p>Новые подробности</p>')
        self.assertEqual(detail['card']['version'], 2)
        self.assertTrue(detail['card']['asap'])
        self.assertEqual(detail['activity'][0]['action'], 'Карточка изменена')
        self.assertIn('Описание', detail['activity'][0]['data']['Изменены поля'])
        self.assertEqual(self.card_page(lane, q='Уточнённый').json()['items'][0]['id'], str(first))
        today = datetime.now(timezone.utc).date().isoformat()
        updated = self.card_page(lane, date_field='updated', date_from=today, q='Уточнённый').json()['items']
        self.assertEqual([item['id'] for item in updated], [str(first)])
        self.assertTrue(detail['card']['updated'].startswith(today))
        with Session(self.engine) as session:
            card = session.get(Card, first)
            self.assertEqual(card.source_data['title'], 'Оригинал')
            self.assertEqual(card.source_updated_at.year, 2020)
            self.assertEqual(card.display_number, number)
            self.assertEqual(card.sort_order, position)
            self.assertEqual(card.column_id, self.second)
            self.assertEqual(card.lane_id, lane)

    def test_edit_partial_fields_clear_optional_values_and_reject_stale_write(self):
        first, second, lane = self.seed_cards()
        url = f'/api/v1/cards/{first}/edit'
        with Session(self.engine) as session, session.begin():
            card = session.get(Card, first)
            card.description = '<p>Сохранить форматирование</p>'
            card.due_date = datetime(2026, 11, 15, 10, 30, tzinfo=timezone.utc)
        self.assertEqual(self.client.post(url, json={'version': 1, 'title': 'Новое название'}).status_code, 200)
        self.assertEqual(self.client.post(url, json={'version': 1, 'title': 'Старое окно'}).status_code, 409)
        detail = self.client.get(f'/api/v1/cards/{first}/detail').json()['card']
        self.assertEqual(detail['description'], '<p>Сохранить форматирование</p>')
        self.assertIn('10:30', detail['dueDate'])
        self.assertEqual(self.client.post(url, json={'version': 2, 'description': '', 'dueDate': None, 'asap': False}).status_code, 200)
        detail = self.client.get(f'/api/v1/cards/{first}/detail').json()['card']
        self.assertEqual(detail['description'], '')
        self.assertIsNone(detail['dueDate'])
        self.assertEqual(detail['title'], 'Новое название')
        self.assertEqual(detail['version'], 3)
        self.assertEqual(self.client.post(url, json={'version': 3, 'title': 'Новое название'}).status_code, 200)
        self.assertEqual(self.client.get(f'/api/v1/cards/{first}/detail').json()['card']['version'], 3)

    def test_edit_catalogs_include_unassigned_values_and_new_tags_can_be_created_without_duplicates(self):
        first, second, lane = self.seed_cards()
        user_id, tag_id = uuid4(), uuid4()
        with Session(self.engine) as session, session.begin():
            session.add_all([models.User(id=user_id, full_name='Ещё не назначенный', email='private@example.test'),
                             Tag(id=tag_id, name='Свободный тег'), models.User(full_name='Заглушка', is_stub=True)])
        result = self.client.get(f'/api/v1/boards/{self.board_id}/edit-options')
        self.assertEqual(result.status_code, 200, result.text)
        self.assertIn(str(user_id), [item['id'] for item in result.json()['users']])
        self.assertIn(str(tag_id), [item['id'] for item in result.json()['tags']])
        self.assertNotIn('private@example.test', result.text)
        url = f'/api/v1/boards/{self.board_id}/tags'
        body = {'name': '  Новый тег  ', 'requestId': str(uuid4())}
        created = self.client.post(url, json=body)
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()['name'], 'Новый тег')
        self.assertEqual(self.client.post(url, json=body).json()['id'], created.json()['id'])
        self.assertEqual(self.client.post(url, json={'name': 'новый ТЕГ', 'requestId': str(uuid4())}).json()['id'], created.json()['id'])
        self.assertEqual(self.client.post(url, json={'name': '', 'requestId': str(uuid4())}).status_code, 422)

    def test_edit_tags_members_responsibility_and_subscribers_are_atomic_and_update_filters(self):
        first, second, lane = self.seed_cards()
        user1, user2, tag_id = uuid4(), uuid4(), uuid4()
        with Session(self.engine) as session, session.begin():
            session.add_all([models.User(id=user1, full_name='Анна'), models.User(id=user2, full_name='Борис'), Tag(id=tag_id, name='Новый')])
        url = f'/api/v1/cards/{first}/edit'
        body = {'version': 1, 'tagIds': [str(tag_id)], 'members': [{'id': str(user1)}, {'id': str(user2), 'role': 2}], 'subscriberIds': [str(user1)]}
        result = self.client.post(url, json=body)
        self.assertEqual(result.status_code, 200, result.text)
        model = self.client.get(f'/api/v1/cards/{first}/detail').json()
        self.assertEqual([item['id'] for item in model['tags']], [str(tag_id)])
        self.assertEqual({(item['id'], item['role']) for item in model['members']}, {(str(user1), 1), (str(user2), 2)})
        self.assertEqual([item['id'] for item in model['subscribers']], [str(user1)])
        self.assertEqual(self.card_page(lane, user_id=str(user2), tag_id=str(tag_id)).json()['items'][0]['id'], str(first))
        bad = self.client.post(url, json={'version': 2, 'title': 'Не записать', 'tagIds': [], 'members': [{'id': str(uuid4())}]})
        self.assertEqual(bad.status_code, 400)
        model = self.client.get(f'/api/v1/cards/{first}/detail').json()
        self.assertEqual(model['card']['version'], 2)
        self.assertNotEqual(model['card']['title'], 'Не записать')
        self.assertEqual(model['tags'][0]['id'], str(tag_id))
        result = self.client.post(url, json={'version': 2, 'tagIds': [], 'members': [], 'subscriberIds': []})
        self.assertEqual(result.status_code, 200, result.text)
        model = self.client.get(f'/api/v1/cards/{first}/detail').json()
        self.assertEqual([model['tags'], model['members'], model['subscribers']], [[], [], []])

    def test_edit_other_fields_properties_and_checklist_items_validate_card_ownership(self):
        first, second, lane = self.seed_cards()
        type_id, prop_id, checklist_id, entry_id, other_entry = [uuid4() for _ in range(5)]
        with Session(self.engine) as session, session.begin():
            session.add_all([models.CardType(id=type_id, name='Заказ'), models.CustomProperty(id=prop_id, name='Тираж', type='number'),
                             models.Checklist(id=checklist_id, name='Подготовка'), models.Checklist(name='Чужой', id=other_entry)])
            session.flush()
            session.add_all([models.CardChecklist(card_id=first, checklist_id=checklist_id, sort_order=0),
                             models.ChecklistItem(id=entry_id, checklist_id=checklist_id, text='Макет'),
                             models.ChecklistItem(id=other_entry, checklist_id=other_entry, text='Чужой пункт')])
        url = f'/api/v1/cards/{first}/edit'
        result = self.client.post(url, json={'version': 1, 'typeId': str(type_id), 'sizeText': '500 шт.', 'externalId': 'ABC',
            'plannedStart': '2026-11-01T09:00:00+03:00', 'properties': [{'id': str(prop_id), 'value': 500}],
            'checklistItems': [{'id': str(entry_id), 'checked': True, 'text': 'Макет согласован'}]})
        self.assertEqual(result.status_code, 200, result.text)
        model = self.client.get(f'/api/v1/cards/{first}/detail').json()
        self.assertEqual(model['card']['type']['id'], str(type_id))
        self.assertEqual(model['card']['sizeText'], '500 шт.')
        self.assertEqual(model['properties'][0]['value'], 500)
        self.assertTrue(model['checklists'][0]['items'][0]['checked'])
        self.assertEqual(model['checklists'][0]['items'][0]['text'], 'Макет согласован')
        for changes in ({'checklistItems': [{'id': str(other_entry), 'checked': True}]},
                        {'properties': [{'id': str(prop_id), 'value': 'Не число'}]}, {'typeId': str(uuid4())}):
            result = self.client.post(url, json={'version': 2, **changes})
            self.assertEqual(result.status_code, 400, result.text)
        self.assertEqual(self.client.get(f'/api/v1/cards/{first}/detail').json()['card']['version'], 2)

    def test_edit_validates_input_and_rejects_archived_deleted_stub_and_missing_cards(self):
        first, second, lane = self.seed_cards()
        url = f'/api/v1/cards/{first}/edit'
        for changes in ({'title': ''}, {'title': '   '}, {'title': 'x' * 501}, {'title': None},
                        {'description': None}, {'description': 'x' * 100001}, {'asap': None}, {'asap': 'yes'},
                        {'dueDate': 'bad'}, {'dueDate': '2026-11-01T10:00:00'}, {'columnId': str(self.child)}, {}):
            result = self.client.post(url, json={'version': 1, **changes})
            self.assertEqual(result.status_code, 422, result.text)
        with Session(self.engine) as session:
            rows = list(session.scalars(select(Card).where(Card.board_id == self.board_id)))
            invalid = [(row.id, 400 if row.archived else 404) for row in rows if row.archived or row.is_stub or row.deleted_at]
        for identifier, status in invalid + [(uuid4(), 404)]:
            self.assertEqual(self.client.post(f'/api/v1/cards/{identifier}/edit', json={'version': 1, 'title': 'Нельзя'}).status_code, status)

    def test_move_reorders_within_cell_and_moves_between_lanes_and_empty_cells(self):
        first, second, lane = self.seed_cards()
        url = f'/api/v1/cards/{second}/move'
        result = self.client.post(url, json={'version': 1, 'columnId': str(self.second), 'laneId': str(lane), 'beforeCardId': str(first)})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual([item['id'] for item in self.card_page(lane).json()['items']], [str(second), str(first)])
        with Session(self.engine) as session:
            other_lane = session.scalar(select(Lane.id).where(Lane.board_id == self.board_id, Lane.id != lane))
            self.assertEqual(len(list(session.scalars(select(models.CardLocationHistory).where(models.CardLocationHistory.card_id == second)))), 0)
        result = self.client.post(url, json={'version': 2, 'columnId': str(self.child), 'laneId': str(other_lane)})
        self.assertEqual(result.status_code, 200, result.text)
        detail = self.client.get(f'/api/v1/cards/{second}/detail').json()
        self.assertEqual(detail['card']['lane']['id'], str(other_lane))
        self.assertEqual(detail['card']['column']['id'], str(self.child))

    def test_move_rejects_invalid_destination_anchor_and_archive_atomically(self):
        first, second, lane = self.seed_cards()
        url = f'/api/v1/cards/{first}/move'
        body = {'version': 1, 'columnId': str(self.second), 'laneId': str(lane)}
        for overrides, status in [({'columnId': str(self.parent)}, 400), ({'columnId': str(uuid4())}, 400),
                                  ({'laneId': None}, 400), ({'laneId': str(uuid4())}, 400),
                                  ({'beforeCardId': str(first)}, 400), ({'beforeCardId': str(uuid4())}, 409),
                                  ({'beforeCardId': str(second), 'afterCardId': str(second)}, 400)]:
            result = self.client.post(url, json=body | overrides)
            self.assertEqual(result.status_code, status, result.text)
        with Session(self.engine) as session, session.begin():
            card = session.get(Card, first)
            self.assertEqual(card.local_version, 1)
            card.archived = True
        self.assertEqual(self.client.post(url, json=body).status_code, 400)

    def test_move_next_preserves_lane_records_history_and_rejects_stale_retries(self):
        first, second, lane = self.seed_cards()
        with Session(self.engine) as session, session.begin():
            session.get(Card, first).column_id = self.child
        url = f'/api/v1/cards/{first}/move-next'
        self.assertEqual(self.client.post(url, json={'version': 1}).status_code, 200)
        detail = self.client.get(f'/api/v1/cards/{first}/detail').json()
        self.assertEqual(detail['card']['column']['id'], str(self.second))
        self.assertEqual(detail['card']['lane']['id'], str(lane))
        self.assertEqual(detail['card']['version'], 2)
        self.assertEqual(detail['history'][0]['column'], 'Готово')
        self.assertEqual(self.client.post(url, json={'version': 1}).status_code, 409)
        self.assertEqual(self.client.post(url, json={'version': 2}).status_code, 400)
        with Session(self.engine) as session:
            self.assertEqual(len(list(session.scalars(select(models.CardLocationHistory).where(models.CardLocationHistory.card_id == first)))), 1)

    def test_chat_persists_text_links_files_and_deduplicates_retries(self):
        first, second, lane = self.seed_cards()
        data = b'\x89PNG\r\n\x1a\nlocal-test'
        payload = {'requestId':str(uuid4()), 'text':'Текст https://example.com', 'files':[{'name':'../макет.png', 'data':base64.b64encode(data).decode()}]}
        url = f'/api/v1/cards/{first}/comments'
        response = self.client.post(url, json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(self.client.post(url, json=payload).json(), response.json())
        detail = self.client.get(f'/api/v1/cards/{first}/detail').json()
        comment = next(row for row in detail['comments'] if row['id'] == response.json()['id'])
        self.assertEqual(comment['text'], payload['text'])
        self.assertTrue(comment['extra']['local'])
        file = next(row for row in detail['files'] if row['commentId'] == comment['id'])
        self.assertEqual(file['name'], 'макет.png')
        self.assertEqual(file['mime'], 'image/png')
        self.assertEqual(self.client.get(file['url']).content, data)
        self.assertEqual(len(list(self.app.state.settings.upload_root.iterdir())), 1)
        self.assertEqual(self.client.post(url, json=dict(payload,text='Изменён')).status_code, 400)
        self.assertEqual(self.client.post(url, json={'requestId':str(uuid4()),'files':[{'name':'evil.html','data':base64.b64encode(b'<script>bad</script>').decode()}]}).status_code,201)
        files = self.client.get(f'/api/v1/cards/{first}/detail').json()['files']
        html = next(file for file in files if file['name']=='evil.html')
        self.assertTrue(self.client.get(html['url']).headers['content-disposition'].startswith('attachment'))

    def test_chat_rejects_invalid_content_and_rolls_back_failed_file_write(self):
        first, second, lane = self.seed_cards()
        url=f'/api/v1/cards/{first}/comments'
        self.assertEqual(self.client.post(url,json={'requestId':str(uuid4()),'text':'  '}).status_code,400)
        self.assertEqual(self.client.post(url,json={'requestId':str(uuid4()),'files':[{'name':'file','data':'invalid!'}]}).status_code,400)
        payload={'requestId':str(uuid4()),'text':'Не сохранить','files':[{'name':'file','data':'YWJj'}]}
        with patch.object(Path, 'open', side_effect=OSError('disk full')):
            self.assertEqual(self.client.post(url,json=payload).status_code,500)
        with Session(self.engine) as session:
            self.assertIsNone(session.scalar(select(models.Comment.id).where(models.Comment.text=='Не сохранить')))
        self.assertEqual(self.client.post(f'/api/v1/cards/{uuid4()}/comments',json=payload).status_code,404)

    def test_local_create_is_persisted_and_repeated_request_does_not_duplicate(self):
        first, second, lane = self.seed_cards()
        payload = {'title': '  Новый заказ  ', 'columnId': str(self.second), 'laneId': str(lane), 'requestId': str(uuid4())}
        url = f'/api/v1/boards/{self.board_id}/cards'
        response = self.client.post(url, json=payload)
        self.assertEqual(response.status_code, 201)
        identifier = response.json()['id']
        self.assertEqual(self.client.post(url, json=payload).json()['id'], identifier)
        with Session(self.engine) as session:
            rows = list(session.scalars(select(Card).where(Card.title == 'Новый заказ')))
            self.assertEqual(len(rows), 1)
            self.assertIsNone(rows[0].source_id)
            self.assertIsNone(rows[0].source_instance_id)
            self.assertIsNone(rows[0].display_number)
            self.assertGreater(rows[0].sort_order, 0)
        self.assertEqual(self.client.get(f'/api/v1/cards/{identifier}/detail').json()['card']['title'], 'Новый заказ')
        self.assertEqual(self.client.post(url, json=dict(payload, title='Другое название')).status_code, 400)

    def test_create_validates_title_column_lane_and_board_without_partial_writes(self):
        first, second, lane = self.seed_cards()
        payload = {'title': 'Новый заказ', 'columnId': str(self.second), 'laneId': str(lane), 'requestId': str(uuid4())}
        url = f'/api/v1/boards/{self.board_id}/cards'
        for title in ('   ', 'x' * 501):
            self.assertEqual(self.client.post(url, json=dict(payload, title=title)).status_code, 422)
        for patch in ({'columnId': str(self.parent)}, {'columnId': str(uuid4())}, {'laneId': str(uuid4())}, {'laneId': None}):
            self.assertEqual(self.client.post(url, json=dict(payload, **patch)).status_code, 400)
        self.assertEqual(self.client.post(f'/api/v1/boards/{self.other_board}/cards', json=payload).status_code, 404)
        with Session(self.engine) as session:
            self.assertIsNone(session.scalar(select(Card.id).where(Card.title == 'Новый заказ')))


if __name__ == '__main__':
    unittest.main()
