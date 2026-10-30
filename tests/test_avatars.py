import base64
from io import BytesIO
from unittest.mock import patch
import unittest
from uuid import uuid4
from PIL import Image
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from backend.app.application.avatars import normalize_avatar, download_source
from backend.app.infrastructure.database.avatar_models import UserAvatar
from backend.app.infrastructure.database.board_models import User, FileObject, Board, Column, Card, CardMember, Comment
from tests import test_auth


def picture(color='red'):
    output = BytesIO()
    Image.new('RGB', (40, 60), color).save(output, 'PNG')
    return output.getvalue()


class AvatarTests(unittest.TestCase):
    setUp = test_auth.AuthTests.setUp
    tearDown = test_auth.AuthTests.tearDown
    activate = test_auth.AuthTests.activate
    login = test_auth.AuthTests.login
    post = test_auth.AuthTests.post
    def test_avatar_lifecycle_is_private_and_custom_choice_survives_import(self):
        avatars = self.app.state.avatars
        source = 'data:image/png;base64,' + base64.b64encode(picture()).decode()
        with Session(self.engine) as session, session.begin():
            session.get(User, self.user_id).source_data = {'avatar_type': 2, 'avatar_initials_url': source}
        self.assertEqual(avatars.import_saved()['saved'], 1)
        self.assertEqual(avatars.import_saved()['skipped'], 1)
        imported = avatars.reset(self.user_id, 'imported')['avatarUrl']
        self.assertEqual(self.client.get(imported).status_code, 401)
        self.activate(role='viewer'); self.login()
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['avatarUrl'], imported)
        self.assertEqual(self.client.get(imported).status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/avatar', content=picture()).status_code, 403)
        headers = {'X-CSRF-Token': self.client.cookies.get('board_csrf')}
        response = self.client.post('/api/v1/auth/avatar', content=picture('blue'), headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        custom = response.json()['avatarUrl']
        self.assertNotEqual(custom, imported)
        image_response = self.client.get(custom)
        self.assertEqual(image_response.headers['content-type'], 'image/png')
        self.assertEqual(Image.open(BytesIO(image_response.content)).size, (256, 256))
        self.assertEqual(self.client.get(imported).status_code, 404)
        self.assertEqual(avatars.import_saved(force=True)['saved'], 1)
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['avatarUrl'], custom)
        self.assertEqual(self.post('/auth/avatar/reset', {'mode': 'initials'}).json()['avatarUrl'], None)
        self.assertEqual(self.client.get(custom).status_code, 404)
        self.assertEqual(self.post('/auth/avatar/reset', {'mode': 'imported'}).json()['avatarUrl'], imported)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(FileObject)), 2)
            self.assertEqual(session.get(UserAvatar, self.user_id).mode, 'imported')

    def test_invalid_upload_does_not_replace_avatar_or_create_files(self):
        self.activate(); self.login()
        before = self.app.state.avatars.save(self.user_id, picture())['avatarUrl']
        for data in (b'<svg></svg>', b'not an image', b'', b'x' * (5 * 1024 * 1024 + 1)):
            response = self.client.post('/api/v1/auth/avatar', content=data,
                headers={'X-CSRF-Token': self.client.cookies.get('board_csrf')})
            self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['avatarUrl'], before)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(FileObject)), 1)

    def test_avatar_projection_on_board_and_details(self):
        url = self.app.state.avatars.save(self.user_id, picture())['avatarUrl']
        board, column, card = uuid4(), uuid4(), uuid4()
        with Session(self.engine) as session, session.begin():
            session.add(Board(id=board, title='Board')); session.flush()
            session.add(Column(id=column, board_id=board)); session.flush()
            session.add(Card(id=card, board_id=board, column_id=column)); session.flush()
            session.add_all([CardMember(card_id=card, user_id=self.user_id, role=1),
                CardMember(card_id=card, user_id=self.user_id, role=2), Comment(card_id=card, author_id=self.user_id, text='Hello')])
        repository = self.app.state.boards.repository
        preview = repository.cards(board, column, None)['items'][0]
        self.assertEqual(len(preview['members']), 1)
        self.assertEqual(preview['members'][0]['avatarUrl'], url)
        detail = repository.detail(card)
        self.assertEqual(detail['members'][0]['avatarUrl'], url)
        self.assertEqual(detail['comments'][0]['author']['avatarUrl'], url)

    def test_download_rejects_other_hosts_and_import_falls_back(self):
        for source in ('http://files.kaiten.ru/a', 'https://other.test/a', 'https://files.kaiten.ru@other.test/a'):
            with self.assertRaises(ValueError): download_source(source)
        initial = 'data:image/png;base64,' + base64.b64encode(picture()).decode()
        with Session(self.engine) as session, session.begin():
            session.get(User, self.user_id).source_data = {'avatar_type': 3, 'avatar_uploaded_url': 'https://files.kaiten.ru/a.jpg', 'avatar_initials_url': initial}
        with patch('backend.app.application.avatars.download_source', side_effect=[OSError('offline'), picture()]):
            result = self.app.state.avatars.import_saved()
        self.assertEqual(result['saved'], 1)
        self.assertEqual(result['fallbacks'], 1)
        self.assertEqual(result['errors'], [])
