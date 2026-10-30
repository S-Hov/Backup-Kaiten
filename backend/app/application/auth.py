"""Local identity lifecycle. Imported profiles never grant login privileges."""
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from sqlalchemy import select, update, func
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException
from backend.app.core.passwords import hash_password, verify_password, token_hash
from backend.app.infrastructure.database.board_models import Account, User
from backend.app.infrastructure.database.auth_models import LoginSession, AccessToken, AuthThrottle, AuthEvent
from backend.app.infrastructure.database.avatar_models import UserAvatar, avatar_url


def now():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def login_name(email):
    email = email.strip().casefold()
    if len(email) > 200 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise ValueError('Укажите корректную почту')
    return email


class AuthService:
    def __init__(self, engine):
        self.engine = engine

    def throttle(self, bucket, limit=10):
        key = token_hash(bucket)
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        insert = pg_insert if self.engine.dialect.name == 'postgresql' else sqlite_insert
        with Session(self.engine) as session, session.begin():
            session.execute(insert(AuthThrottle).values(key=key, attempts=0, started_at=now()).on_conflict_do_nothing(index_elements=['key']))
            row = session.scalar(select(AuthThrottle).where(AuthThrottle.key == key).with_for_update())
            if aware(row.started_at) < now() - timedelta(minutes=15):
                row.attempts, row.started_at = 0, now()
            if row.attempts >= limit:
                raise HTTPException(429, 'Слишком много попыток. Повторите через 15 минут')
            row.attempts += 1

    @staticmethod
    def profile(account, user, avatar=None):
        return {'id': str(account.id), 'userId': str(user.id), 'email': account.login, 'name': user.full_name or account.login,
                'role': account.role, 'initials': user.initials, 'timezone': user.timezone, 'language': user.language,
                'avatarUrl': avatar_url(user.id, avatar),
                'sourceId': str(user.source_id) if user.source_id is not None else None}

    def update_profile(self, identity, name):
        name = ' '.join(name.split())
        if not name or len(name) > 200:
            raise ValueError('Укажите имя от 1 до 200 символов')
        if any(ord(character) < 32 or ord(character) == 127 for character in name):
            raise ValueError('Имя содержит недопустимые символы')
        with Session(self.engine) as session, session.begin():
            account = session.get(Account, identity['accountId'])
            user = session.scalar(select(User).where(User.id == identity['userId']).with_for_update())
            if user.full_name != name:
                user.full_name = name
                user.initials = ''.join(part[0] for part in name.split()[:2]).upper()
                user.local_version += 1
                session.add(AuthEvent(actor_id=account.id, subject_id=account.id, action='profile_updated'))
            return self.profile(account, user, session.get(UserAvatar, user.id))

    def session(self, token):
        if not token or len(token) > 128:
            raise HTTPException(401, 'Войдите в систему')
        with Session(self.engine) as session:
            row = session.scalar(select(LoginSession).where(LoginSession.token_hash == token_hash(token), LoginSession.revoked_at.is_(None), LoginSession.expires_at > now()))
            account = session.get(Account, row.account_id) if row else None
            user = session.get(User, account.user_id) if account else None
            if not account or not account.active or not user:
                raise HTTPException(401, 'Сессия завершена. Войдите снова')
            return {'profile': self.profile(account, user, session.get(UserAvatar, user.id)), 'sessionId': row.id, 'csrfHash': row.csrf_hash, 'accountId': account.id, 'userId': user.id, 'role': account.role}

    def login(self, email, password, ip, agent):
        email = login_name(email)
        self.throttle('login-ip:' + ip, 30)
        self.throttle('login-email:' + email, 10)
        with Session(self.engine) as session, session.begin():
            account = session.scalar(select(Account).where(Account.login == email).with_for_update())
            valid = verify_password(password, account.password_hash if account else None)
            if not account or not valid or not account.active:
                session.add(AuthEvent(subject_id=account.id if account else None, action='login_failed'))
                failure = True
            else:
                failure = False
                token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
                session.add(LoginSession(account_id=account.id, token_hash=token_hash(token), csrf_hash=token_hash(csrf),
                    expires_at=now()+timedelta(hours=12), user_agent=agent[:300]))
                account.last_login_at = now()
                session.add(AuthEvent(actor_id=account.id, subject_id=account.id, action='login'))
                result = self.profile(account, session.get(User, account.user_id), session.get(UserAvatar, account.user_id))
                session.execute(update(AuthThrottle).where(AuthThrottle.key == token_hash('login-email:' + email)).values(attempts=0))
        if failure:
            raise HTTPException(401, 'Неверная почта или пароль либо доступ отключён')
        return result, token, csrf

    def logout(self, identity, all_sessions=False):
        with Session(self.engine) as session, session.begin():
            condition = LoginSession.account_id == identity['accountId'] if all_sessions else LoginSession.id == identity['sessionId']
            session.execute(update(LoginSession).where(condition, LoginSession.revoked_at.is_(None)).values(revoked_at=now()))
            session.add(AuthEvent(actor_id=identity['accountId'], action='logout_all' if all_sessions else 'logout'))

    def invite(self, email, role='member', actor=None):
        email = login_name(email)
        if role not in ('admin', 'member', 'viewer'):
            raise ValueError('Неизвестная роль')
        with Session(self.engine) as session, session.begin():
            # Serializes invitation creation for existing imported profiles.
            existing = session.scalar(select(Account).where(Account.login == email).with_for_update())
            users = [session.get(User, existing.user_id)] if existing else list(session.scalars(select(User).where(func.lower(User.email) == email).order_by(User.id).with_for_update()))
            if len(users) > 1:
                raise ValueError('В источниках несколько профилей с этой почтой; сначала устраните дубликат')
            if users:
                user = users[0]
            else:
                user = User(full_name=email, email=email, activated=True)
                session.add(user); session.flush()
            account = session.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
            if account is None:
                account = Account(user_id=user.id, login=email, role=role, active=False)
                session.add(account); session.flush()
            elif account.role != role:
                raise ValueError('Роль существующей учётной записи меняется отдельно')
            account.disabled_at = None
            session.execute(update(AccessToken).where(AccessToken.account_id == account.id, AccessToken.used_at.is_(None)).values(used_at=now()))
            token = secrets.token_urlsafe(32)
            session.add(AccessToken(account_id=account.id, token_hash=token_hash(token), expires_at=now()+timedelta(hours=24)))
            session.add(AuthEvent(actor_id=actor, subject_id=account.id, action='invite', data={'role': role}))
            return {'token': token, 'email': email, 'expiresInHours': 24, 'accountId': str(account.id)}

    def activate(self, token, password, ip):
        self.throttle('activate:' + ip, 30)
        with Session(self.engine) as session, session.begin():
            grant = session.scalar(select(AccessToken).where(AccessToken.token_hash == token_hash(token)))
            if not grant or grant.used_at or aware(grant.expires_at) <= now():
                raise ValueError('Ссылка недействительна или уже использована. Запросите новую у администратора')
            account = session.scalar(select(Account).where(Account.id == grant.account_id).with_for_update())
            # All credential changes lock account before token/session rows.
            grant = session.scalar(select(AccessToken).where(AccessToken.id == grant.id).execution_options(populate_existing=True).with_for_update())
            if grant.used_at or aware(grant.expires_at) <= now():
                raise ValueError('Ссылка недействительна или уже использована')
            account.password_hash, account.active, account.password_changed_at = hash_password(password), True, now()
            account.disabled_at = None
            grant.used_at = now()
            session.execute(update(AccessToken).where(AccessToken.account_id == account.id, AccessToken.used_at.is_(None)).values(used_at=now()))
            session.execute(update(LoginSession).where(LoginSession.account_id == account.id, LoginSession.revoked_at.is_(None)).values(revoked_at=now()))
            session.add(AuthEvent(subject_id=account.id, action='password_set'))
            return {'email': account.login}

    def change_password(self, identity, current, new):
        self.throttle('change-password:' + str(identity['accountId']), 10)
        with Session(self.engine) as session, session.begin():
            account = session.scalar(select(Account).where(Account.id == identity['accountId']).with_for_update())
            if not verify_password(current, account.password_hash):
                raise ValueError('Текущий пароль неверен')
            account.password_hash, account.password_changed_at = hash_password(new), now()
            session.execute(update(LoginSession).where(LoginSession.account_id == account.id, LoginSession.revoked_at.is_(None)).values(revoked_at=now()))
            session.execute(update(AccessToken).where(AccessToken.account_id == account.id, AccessToken.used_at.is_(None)).values(used_at=now()))
            session.add(AuthEvent(actor_id=account.id, subject_id=account.id, action='password_changed'))

    def sessions(self, identity):
        with Session(self.engine) as session:
            rows = session.scalars(select(LoginSession).where(LoginSession.account_id == identity['accountId'], LoginSession.revoked_at.is_(None), LoginSession.expires_at > now()).order_by(LoginSession.created_at.desc()))
            return [{'id': str(row.id), 'created': row.created_at.isoformat(), 'expires': row.expires_at.isoformat(), 'userAgent': row.user_agent, 'current': row.id == identity['sessionId']} for row in rows]

    def users(self):
        with Session(self.engine) as session:
            rows = session.execute(select(User, Account, UserAvatar).outerjoin(Account, Account.user_id == User.id).outerjoin(UserAvatar, UserAvatar.user_id == User.id).where(User.is_stub.is_(False)).order_by(User.full_name, User.id))
            return [{'userId': str(user.id), 'name': user.full_name, 'email': account.login if account else user.email,
                'sourceId': str(user.source_id) if user.source_id is not None else None, 'sourceActive': user.activated,
                'timezone': user.timezone, 'language': user.language, 'initials': user.initials, 'avatarUrl': avatar_url(user.id, avatar),
                'accountId': str(account.id) if account else None, 'role': account.role if account else None,
                'hasPassword': bool(account and account.password_hash),
                'status': ('active' if account.active else 'disabled' if account.disabled_at else 'pending') if account else 'no-access'} for user, account, avatar in rows]

    def set_access(self, actor, account_id, active, role, revoke=False):
        if role not in ('admin', 'member', 'viewer'):
            raise ValueError('Неизвестная роль')
        with Session(self.engine) as session, session.begin():
            admins = list(session.scalars(select(Account).where(Account.role == 'admin').order_by(Account.id).with_for_update()))
            account = session.scalar(select(Account).where(Account.id == account_id).with_for_update())
            if not account:
                raise FileNotFoundError('Учётная запись не найдена')
            if account.active and account.role == 'admin' and (not active or role != 'admin') and sum(row.active for row in admins) <= 1:
                raise ValueError('Нельзя отключить последнего активного администратора')
            if active and not account.password_hash:
                raise ValueError('Сначала пользователь должен задать пароль по приглашению')
            disable = not active and (account.active or revoke)
            account.active, account.role = active, role
            if active:
                account.disabled_at = None
            if disable:
                account.disabled_at = now()
                session.execute(update(LoginSession).where(LoginSession.account_id == account_id).values(revoked_at=now()))
                session.execute(update(AccessToken).where(AccessToken.account_id == account_id).values(used_at=now()))
            session.add(AuthEvent(actor_id=actor, subject_id=account_id, action='access_changed', data={'role': role, 'active': active, 'revoked': disable}))
