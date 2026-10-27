from uuid import UUID
from backend.app.domain.boards import BoardRepository


class BoardService:
    def __init__(self, repository: BoardRepository):
        self.repository = repository

    def list_boards(self):
        return self.repository.list_boards()

    def structure(self, board_id: UUID):
        return self.repository.structure(board_id)
