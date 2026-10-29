from uuid import UUID
from backend.app.domain.boards import BoardRepository
from pathlib import Path


class BoardService:
    def __init__(self, repository: BoardRepository, backup_root: Path | None = None, upload_root: Path | None = None):
        self.repository = repository
        self.backup_root = backup_root
        self.upload_root = upload_root or Path(__file__).resolve().parents[3] / ".local/uploads"

    def list_boards(self):
        return self.repository.list_boards()

    def structure(self, board_id: UUID):
        return self.repository.structure(board_id)

    def cards(self, board_id, column_id, lane_id, limit, cursor, archived=False, query='', tag_id=None):
        return self.repository.cards(board_id, column_id, lane_id, limit, cursor, archived, query, tag_id)

    def create_card(self, board_id, title, column_id, lane_id, request_id, actor=None):
        return self.repository.create_card(board_id, title, column_id, lane_id, request_id, actor)

    def image(self, attachment_id):
        return self.local_file(self.repository.image(attachment_id))

    def file(self, attachment_id):
        return self.local_file(self.repository.file(attachment_id))

    def detail(self, card_id):
        return self.repository.detail(card_id)

    def move_next(self, card_id, version, actor=None):
        return self.repository.move_next(card_id, version, actor)

    def add_comment(self, card_id, request_id, text, attachments, actor=None):
        import base64
        import binascii
        files, total = [], 0
        for attachment in attachments:
            try:
                data = base64.b64decode(attachment.data, validate=True)
            except (ValueError, binascii.Error) as error:
                raise ValueError('Повреждены данные вложения') from error
            total += len(data)
            if total > 15 * 1024 * 1024:
                raise ValueError('Общий размер вложений — не более 15 МБ')
            name = attachment.name.replace('\\', '/').rsplit('/', 1)[-1].strip()
            if not name or any(ord(char) < 32 for char in name):
                raise ValueError('Неверное имя файла')
            mime = 'application/octet-stream'
            if data.startswith(b'\x89PNG\r\n\x1a\n'): mime = 'image/png'
            elif data.startswith(b'\xff\xd8\xff'): mime = 'image/jpeg'
            elif data.startswith((b'GIF87a', b'GIF89a')): mime = 'image/gif'
            elif data.startswith(b'RIFF') and data[8:12] == b'WEBP': mime = 'image/webp'
            elif data.startswith(b'%PDF-'): mime = 'application/pdf'
            files.append((name, data, mime))
        if not text and not files:
            raise ValueError('Введите комментарий или прикрепите файл')
        return self.repository.add_comment(card_id, request_id, text, files, self.upload_root, actor)

    def local_file(self, image):
        if image['storageKey'].startswith('local-upload:'):
            identifier = UUID(image['storageKey'].split(':', 1)[1])
            path = self.upload_root.resolve() / str(identifier)
            if not path.is_file():
                raise FileNotFoundError('Файл отсутствует в локальном хранилище')
            return path, image['name'], image['mime']
        if self.backup_root is None:
            raise FileNotFoundError('Хранилище изображений не настроено')
        root = self.backup_root.resolve()
        path = (root / image['storageKey']).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise FileNotFoundError('Изображение отсутствует в локальной копии')
        return path, image['name'], image['mime']
