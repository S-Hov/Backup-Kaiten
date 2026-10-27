"""Read boundary for the working board, independent of archive snapshots."""
from typing import Protocol
from uuid import UUID


class BoardRepository(Protocol):
    def list_boards(self) -> list[dict]: ...
    def structure(self, board_id: UUID) -> dict: ...
