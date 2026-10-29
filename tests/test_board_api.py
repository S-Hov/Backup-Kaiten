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
        settings = Settings(backup_root=root / 'no-json-archive', upload_root=root / 'uploads', database_url=self.url)
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
            self.assertEqual(len(statements), 5)
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
