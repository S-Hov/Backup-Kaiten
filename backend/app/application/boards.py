from uuid import UUID
from backend.app.domain.boards import BoardRepository
from pathlib import Path


class BoardService:
    def __init__(self, repository: BoardRepository, backup_root: Path | None = None):
        self.repository = repository
        self.backup_root = backup_root

    def list_boards(self):
        return self.repository.list_boards()

    def structure(self, board_id: UUID):
        return self.repository.structure(board_id)

    def cards(self, board_id, column_id, lane_id, limit, cursor):
        return self.repository.cards(board_id, column_id, lane_id, limit, cursor)

    def image(self, attachment_id):
        image = self.repository.image(attachment_id)
        if self.backup_root is None:
            raise FileNotFoundError('Хранилище изображений не настроено')
        root = self.backup_root.resolve()
        path = (root / image['storageKey']).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise FileNotFoundError('Изображение отсутствует в локальной копии')
        return path, image['name'], image['mime']
