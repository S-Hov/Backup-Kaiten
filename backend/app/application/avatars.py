"""Local avatar storage. Browser requests never download files from Kaiten."""
import base64
import hashlib
from io import BytesIO
from pathlib import Path
from uuid import uuid4
import warnings
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from PIL import Image, ImageOps, UnidentifiedImageError
from backend.app.infrastructure.database.avatar_models import UserAvatar, avatar_url
from backend.app.infrastructure.database.board_models import User, FileObject, SourceInstance
from backend.app.infrastructure.database.models import ArchiveSnapshot

MAX_AVATAR_BYTES = 5 * 1024 * 1024


def normalize_avatar(data):
    if not data or len(data) > MAX_AVATAR_BYTES:
        raise ValueError('Размер аватарки должен быть от 1 байта до 5 МБ')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=['PNG', 'JPEG', 'WEBP', 'GIF']) as image:
                if image.width * image.height > 16_000_000:
                    raise ValueError('Размер изображения — не более 16 мегапикселей')
                image.load()
                cropped = ImageOps.fit(ImageOps.exif_transpose(image).convert('RGBA'), (256, 256), method=Image.Resampling.LANCZOS)
                clean = Image.new('RGBA', (256, 256))
                clean.paste(cropped)
                output = BytesIO()
                clean.save(output, format='PNG')
                return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise ValueError('Выберите корректное изображение PNG, JPEG, WebP или GIF') from error


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def download_source(source):
    if source.startswith('data:image/png;base64,'):
        if len(source) > MAX_AVATAR_BYTES * 2:
            raise ValueError('Аватарка слишком большая')
        return base64.b64decode(source.split(',', 1)[1], validate=True)
    url = urlsplit(source)
    if url.scheme != 'https' or url.hostname != 'files.kaiten.ru' or url.port not in (None, 443) or url.username or url.password:
        raise ValueError('Разрешены только сохранённые аватарки files.kaiten.ru')
    with build_opener(NoRedirect()).open(Request(source, headers={'User-Agent': 'LocalBoard-AvatarImport/1'}), timeout=20) as response:
        data = response.read(MAX_AVATAR_BYTES + 1)
        if len(data) > MAX_AVATAR_BYTES:
            raise ValueError('Аватарка слишком большая')
        return data


class AvatarService:
    def __init__(self, engine, root):
        self.engine, self.root = engine, Path(root).resolve()

    def _write(self, session, data, written):
        identifier = uuid4()
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / str(identifier)
        with path.open('xb') as stream:
            written.append(path)
            stream.write(data)
        session.add(FileObject(id=identifier, storage_key=f'local-upload:{identifier}', size=len(data), mime_type='image/png',
            sha256=hashlib.sha256(data).hexdigest(), hash_verified=True))
        session.flush()
        return identifier

    def save(self, user_id, raw, *, imported_source=None):
        data = normalize_avatar(raw)
        written = []
        try:
            with Session(self.engine) as session, session.begin():
                user = session.scalar(select(User).where(User.id == user_id).with_for_update())
                if user is None:
                    raise FileNotFoundError('Пользователь не найден')
                row = session.get(UserAvatar, user_id)
                if row is None:
                    row = UserAvatar(user_id=user_id, mode='imported'); session.add(row)
                previous_id = row.imported_file_id if imported_source is not None else row.custom_file_id
                previous = session.get(FileObject, previous_id) if previous_id else None
                if previous and previous.sha256 == hashlib.sha256(data).hexdigest() and (self.root / str(previous.id)).is_file():
                    file_id = previous.id
                else:
                    file_id = self._write(session, data, written)
                if imported_source is not None:
                    row.imported_file_id, row.imported_source_hash = file_id, hashlib.sha256(imported_source.encode()).hexdigest()
                else:
                    row.custom_file_id, row.mode = file_id, 'custom'
                return {'avatarUrl': avatar_url(user_id, row)}
        except Exception:
            for path in written: path.unlink(missing_ok=True)
            raise

    def reset(self, user_id, mode):
        if mode not in ('imported', 'initials'):
            raise ValueError('Неизвестный режим аватарки')
        with Session(self.engine) as session, session.begin():
            user = session.scalar(select(User).where(User.id == user_id).with_for_update())
            if user is None: raise FileNotFoundError('Пользователь не найден')
            row = session.get(UserAvatar, user_id)
            if row is None: row = UserAvatar(user_id=user_id); session.add(row)
            row.mode = mode
            return {'avatarUrl': avatar_url(user_id, row)}

    def file(self, user_id, version=None):
        with Session(self.engine) as session:
            row = session.get(UserAvatar, user_id)
            if row is None or row.mode == 'initials': raise FileNotFoundError('Аватарка не задана')
            identifier = row.custom_file_id if row.mode == 'custom' else row.imported_file_id
            if identifier is None or (version is not None and version != identifier): raise FileNotFoundError('Аватарка обновлена')
            obj = session.get(FileObject, identifier)
            if obj is None or obj.storage_key != f'local-upload:{identifier}': raise FileNotFoundError('Аватарка не найдена')
            path = (self.root / str(identifier)).resolve()
            if not path.is_relative_to(self.root): raise FileNotFoundError('Файл аватарки отсутствует')
            if not path.is_file(): raise FileNotFoundError('Файл аватарки отсутствует')
            return path

    def import_saved(self, force=False):
        result = {'saved': 0, 'skipped': 0, 'fallbacks': 0, 'errors': []}
        with Session(self.engine) as session:
            users = [(row.id, row.source_data or {}) for row in session.scalars(select(User).where(User.is_stub.is_(False)))]
        for identifier, data in users:
            initial = data.get('avatar_initials_url')
            photo = data.get('avatar_uploaded_url') if data.get('avatar_type') == 3 else None
            source = photo or initial
            if not isinstance(source, str) or not source:
                result['skipped'] += 1; continue
            with Session(self.engine) as session:
                row = session.get(UserAvatar, identifier)
                if not force and row and row.imported_source_hash == hashlib.sha256(source.encode()).hexdigest() and row.imported_file_id and (self.root / str(row.imported_file_id)).is_file():
                    result['skipped'] += 1; continue
            try:
                try:
                    raw = download_source(source)
                    normalize_avatar(raw)
                except (OSError, ValueError):
                    if not photo or not initial: raise
                    source, raw = initial, download_source(initial)
                    result['fallbacks'] += 1
                self.save(identifier, raw, imported_source=source)
                result['saved'] += 1
            except (OSError, ValueError):
                result['errors'].append({'userId': str(identifier), 'message': 'Не удалось сохранить аватарку'})
        return result

    def enrich_archive(self, model):
        """Add current local portraits without mutating immutable archive payloads."""
        try:
            with Session(self.engine) as session:
                snapshot = session.get(ArchiveSnapshot, model['source']['snapshot'])
                if not snapshot: return model
                source = session.scalar(select(SourceInstance.id).where(SourceInstance.origin == snapshot.summary.get('origin')))
                if not source: return model
                mapping = {str(user.source_id): avatar_url(user.id, row) for user, row in session.execute(select(User, UserAvatar).outerjoin(UserAvatar, UserAvatar.user_id == User.id).where(User.source_instance_id == source))}
        except SQLAlchemyError:
            # The standalone archive viewer can run without working SQL tables.
            return model
        def person(value):
            return dict(value, avatarUrl=mapping.get(str(value.get('id')))) if isinstance(value, dict) else value
        sections = model['sections']
        sections['members'] = [person(value) for value in sections['members']]
        for kind in ('comments', 'activity'):
            sections[kind] = [dict(value, author=person(value.get('author'))) for value in sections[kind]]
        return model
