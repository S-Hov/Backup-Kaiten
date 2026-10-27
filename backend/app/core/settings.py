"""Application settings are separate from the Kaiten exporter's API secrets."""
import os
from dataclasses import dataclass, field
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    backup_root: Path = PROJECT_ROOT / 'backups'
    frontend_root: Path = PROJECT_ROOT / 'frontend'
    storage: str = 'archive'
    database_url: str = field(default=f'sqlite:///{(PROJECT_ROOT / ".local/board.db").as_posix()}', repr=False)

    @classmethod
    def from_env(cls):
        storage = os.getenv('BOARD_STORAGE', 'archive')
        if storage not in ('archive', 'database'):
            raise ValueError('BOARD_STORAGE: archive или database')
        database_url = os.getenv('BOARD_DATABASE_URL', cls.database_url)
        password_file = os.getenv('BOARD_DATABASE_PASSWORD_FILE')
        if password_file:
            from sqlalchemy.engine import make_url
            password = Path(password_file).read_text(encoding='utf-8').strip()
            if not password:
                raise ValueError('Файл пароля PostgreSQL пуст')
            database_url = make_url(database_url).set(password=password).render_as_string(hide_password=False)
        return cls(backup_root=Path(os.getenv('BOARD_BACKUP_ROOT', str(cls.backup_root))).resolve(),
                   frontend_root=Path(os.getenv('BOARD_FRONTEND_ROOT', str(cls.frontend_root))).resolve(),
                   storage=storage, database_url=database_url)
