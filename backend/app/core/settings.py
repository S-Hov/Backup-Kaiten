"""Application settings are separate from the Kaiten exporter's API secrets."""
import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    backup_root: Path = PROJECT_ROOT / 'backups'
    frontend_root: Path = PROJECT_ROOT / 'frontend'
    storage: str = 'archive'
    database_url: str = f'sqlite:///{(PROJECT_ROOT / ".local/board.db").as_posix()}'

    @classmethod
    def from_env(cls):
        storage = os.getenv('BOARD_STORAGE', 'archive')
        if storage not in ('archive', 'database'):
            raise ValueError('BOARD_STORAGE: archive или database')
        return cls(backup_root=Path(os.getenv('BOARD_BACKUP_ROOT', str(cls.backup_root))).resolve(),
                   frontend_root=Path(os.getenv('BOARD_FRONTEND_ROOT', str(cls.frontend_root))).resolve(),
                   storage=storage, database_url=os.getenv('BOARD_DATABASE_URL', cls.database_url))
