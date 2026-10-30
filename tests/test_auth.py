import tempfile
import unittest
from pathlib import Path
from uuid import uuid4, UUID
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from backend.app.cli import migrate
from backend.app.core.settings import Settings
from backend.app.main import create_app
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.board_repository import SqlBoardRepository
from backend.app.infrastructure.database.board_models import User, Account, Card, Comment, Board, Column
from backend.app.infrastructure.database.auth_models import AccessToken, LoginSession

PASSWORD = 'Test-only-password-45!'


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        url = f'sqlite:///{root / "auth.db"}'
        migrate(url)
        self.engine = make_engine(url)
        self.user_id = uuid4()
        with Session(self.engine) as session, session.begin():
            session.add(User(id=self.user_id, email='admin@example.test', full_name='Администратор', source_id=123, source_data={'permissions': 999999}))
        self.app = create_app(Settings(backup_root=root / 'backups', upload_root=root / 'uploads', database_url=url), board_repository=SqlBoardRepository(self.engine))
        self.auth = self.app.state.auth
        self.client = TestClient(self.app, base_url='http://127.0.0.1')

    def tearDown(self):
        self.client.close(); self.engine.dispose(); self.temp.cleanup()

    def activate(self, email='admin@example.test', role='admin'):
        invitation = self.auth.invite(email, role)
        response = self.client.post('/api/v1/auth/activate', json={'token': invitation['token'], 'password': PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        return invitation

    def login(self, email='admin@example.test', password=PASSWORD):
        result = self.client.post('/api/v1/auth/login', json={'email': email, 'password': password})
        self.assertEqual(result.status_code, 200, result.text)
        return result

    def post(self, path, body=None):
        return self.client.post('/api/v1' + path, json=body, headers={'X-CSRF-Token': self.client.cookies.get('board_csrf', '')})

    def test_imported_user_has_no_access_and_all_data_routes_are_protected(self):
        for path in ('/api/v1/boards', '/api/v1/snapshots', '/api/cards?snapshot=fixture', '/assets/fixture/1/0', '/api/v1/auth/me'):
            self.assertEqual(self.client.get(path).status_code, 401, path)
        self.assertEqual(self.client.get('/api/v1/health').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/login', json={'email':'admin@example.test','password':PASSWORD}).status_code, 401)
        with Session(self.engine) as session:
            self.assertIsNone(session.scalar(select(Account)))

    def test_activation_is_one_time_credentials_are_hashed_and_sessions_revoke(self):
        invite = self.activate()
        self.assertEqual(self.client.post('/api/v1/auth/activate', json={'token':invite['token'],'password':PASSWORD}).status_code, 400)
        login = self.login(' ADMIN@example.test ')
        self.assertIn('HttpOnly', login.headers.get('set-cookie'))
        self.assertIn('SameSite=strict', login.headers.get('set-cookie'))
        cookie = self.client.cookies.get('board_session')
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['userId'], str(self.user_id))
        with Session(self.engine) as session:
            account = session.scalar(select(Account))
            self.assertNotIn(PASSWORD, account.password_hash)
            self.assertNotEqual(session.scalar(select(AccessToken)).token_hash, invite['token'])
            self.assertNotEqual(session.scalar(select(LoginSession)).token_hash, cookie)
        self.assertEqual(self.post('/auth/logout').status_code, 200)
        self.client.cookies.set('board_session', cookie)
        self.assertEqual(self.client.get('/api/v1/auth/me').status_code, 401)

    def test_modified_token_cannot_set_or_reset_password_or_revoke_sessions(self):
        invite = self.auth.invite('admin@example.test', 'admin')
        token = invite['token']
        altered = ('A' if token[0] != 'A' else 'B') + token[1:]
        response = self.client.post('/api/v1/auth/activate', json={'token': altered, 'password': PASSWORD})
        self.assertEqual(response.status_code, 400, response.text)
        with Session(self.engine) as session:
            account = session.scalar(select(Account))
            self.assertIsNone(account.password_hash)
            self.assertFalse(account.active)
            self.assertIsNone(session.scalar(select(AccessToken)).used_at)
        self.assertEqual(self.client.post('/api/v1/auth/activate', json={'token': token, 'password': PASSWORD}).status_code, 200)
        self.login()
        reset = self.auth.invite('admin@example.test', 'admin')
        with Session(self.engine) as session:
            before = session.scalar(select(Account)).password_hash
        bad = reset['token'][:-1] + ('A' if reset['token'][-1] != 'A' else 'B')
        response = self.client.post('/api/v1/auth/activate', json={'token': bad, 'password': 'Another-test-password-123'})
        self.assertEqual(response.status_code, 400)
        with Session(self.engine) as session:
            self.assertEqual(session.scalar(select(Account)).password_hash, before)
            self.assertIsNone(session.scalar(select(AccessToken).where(AccessToken.used_at.is_(None))).used_at)
            self.assertIsNone(session.scalar(select(LoginSession)).revoked_at)
        self.assertEqual(self.client.get('/api/v1/auth/me').status_code, 200)

    def test_csrf_origin_and_viewer_permissions(self):
        self.activate(role='viewer'); self.login()
        self.assertEqual(self.client.get('/api/v1/boards').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/auth/users').status_code, 403)
        self.assertEqual(self.client.post('/api/v1/auth/logout').status_code, 403)
        self.assertEqual(self.post('/boards/'+str(uuid4())+'/cards', {'title':'Not allowed','columnId':str(uuid4()),'requestId':str(uuid4())}).status_code, 403)
        self.assertEqual(self.client.post('/api/v1/auth/login', json={'email':'admin@example.test','password':PASSWORD},headers={'Origin':'https://evil.example'}).status_code, 403)
        self.assertEqual(self.post('/auth/logout-all').status_code, 200)

    def test_admin_invites_member_and_disabled_access_revokes_sessions(self):
        self.activate(); self.login()
        invitation = self.post('/auth/invitations', {'email':'member@example.test','role':'member'})
        self.assertEqual(invitation.status_code, 200)
        identifier = invitation.json()['accountId']
        self.assertEqual(self.post('/auth/accounts/'+identifier+'/access', {'active':True,'role':'member'}).status_code, 400)
        self.assertEqual(self.client.post('/api/v1/auth/activate',json={'token':invitation.json()['token'],'password':PASSWORD}).status_code,200)
        other = TestClient(self.app,base_url='http://127.0.0.1')
        self.assertEqual(other.post('/api/v1/auth/login',json={'email':'member@example.test','password':PASSWORD}).status_code,200)
        self.assertEqual(self.post('/auth/accounts/'+identifier+'/access',{'active':False,'role':'member'}).status_code,200)
        self.assertEqual(other.get('/api/v1/boards').status_code,401)
        other.close()
        me=self.client.get('/api/v1/auth/me').json()
        self.assertEqual(self.post('/auth/accounts/'+me['id']+'/access',{'active':False,'role':'admin'}).status_code,400)
        users=self.client.get('/api/v1/auth/users')
        self.assertEqual(users.status_code,200)
        self.assertNotIn('password_hash',users.text)

    def test_password_change_invalidates_sessions_and_old_password(self):
        self.activate(); self.login()
        self.assertEqual(self.post('/auth/password',{'currentPassword':'wrong','newPassword':'New-test-password-45!'}).status_code,400)
        self.assertEqual(self.post('/auth/password',{'currentPassword':PASSWORD,'newPassword':'New-test-password-45!'}).status_code,200)
        self.assertEqual(self.client.get('/api/v1/auth/me').status_code,401)
        self.assertEqual(self.client.post('/api/v1/auth/login',json={'email':'admin@example.test','password':PASSWORD}).status_code,401)
        self.login(password='New-test-password-45!')

    def test_rate_limit_and_weak_password_validation(self):
        invite=self.auth.invite('admin@example.test','admin')
        self.assertEqual(self.client.post('/api/v1/auth/activate',json={'token':invite['token'],'password':'short'}).status_code,422)
        for _ in range(10):
            self.auth.throttle('login-email:unknown@example.test')
        self.assertEqual(self.client.post('/api/v1/auth/login',json={'email':'unknown@example.test','password':PASSWORD}).status_code,429)

    def test_pending_invitation_can_be_revoked_and_role_change_keeps_it_usable(self):
        self.activate(); self.login()
        invite=self.post('/auth/invitations',{'email':'pending@example.test','role':'member'}).json()
        path='/auth/accounts/'+invite['accountId']+'/access'
        self.assertEqual(self.post(path,{'active':False,'role':'viewer'}).status_code,200)
        row=next(row for row in self.client.get('/api/v1/auth/users').json() if row['email']=='pending@example.test')
        self.assertEqual(row['status'],'pending')
        self.assertEqual(self.post(path,{'active':False,'role':'viewer','revoke':True}).status_code,200)
        self.assertEqual(self.client.post('/api/v1/auth/activate',json={'token':invite['token'],'password':PASSWORD}).status_code,400)
        row=next(row for row in self.client.get('/api/v1/auth/users').json() if row['email']=='pending@example.test')
        self.assertEqual(row['status'],'disabled')

    def test_local_writes_use_authenticated_profile_as_author(self):
        self.activate(); self.login()
        board_id,column_id=uuid4(),uuid4()
        with Session(self.engine) as session, session.begin():
            session.add(Board(id=board_id,title='Доска'));session.flush()
            session.add(Column(id=column_id,board_id=board_id,title='Колонка'))
        response=self.post(f'/boards/{board_id}/cards',{'title':'Заказ','columnId':str(column_id),'requestId':str(uuid4())})
        self.assertEqual(response.status_code,201,response.text)
        card_id=response.json()['id']
        comment=self.post(f'/cards/{card_id}/comments',{'text':'Сообщение','requestId':str(uuid4())})
        self.assertEqual(comment.status_code,201,comment.text)
        with Session(self.engine) as session:
            self.assertEqual(session.get(Card,UUID(card_id)).owner_id,self.user_id)
            self.assertEqual(session.get(Comment,UUID(comment.json()['id'])).author_id,self.user_id)


if __name__ == '__main__':
    unittest.main()
