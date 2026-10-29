"""Application settings are separate from the Kaiten exporter's API secrets."""
import os
from dataclasses import dataclass, field
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    backup_root: Path = PROJECT_ROOT / 'backups'
    frontend_root: Path = PROJECT_ROOT / 'frontend' / 'dist'
    upload_root: Path = PROJECT_ROOT / '.local/uploads'
    storage: str = 'archive'
    auth_required: bool = True
    secure_cookies: bool = False
    allowed_origins: tuple[str, ...] = ('http://127.0.0.1:8766', 'http://localhost:8766', 'http://127.0.0.1:5173', 'http://localhost:5173')
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
                   upload_root=Path(os.getenv('BOARD_UPLOAD_ROOT', str(cls.upload_root))).resolve(),
                   secure_cookies=os.getenv('BOARD_SECURE_COOKIES', '0') == '1',
                   allowed_origins=tuple(item.strip() for item in os.getenv('BOARD_ALLOWED_ORIGINS', ','.join(cls.allowed_origins)).split(',') if item.strip()),
                   storage=storage, database_url=database_url)
