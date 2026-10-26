"""Run: python viewer.py [--backup-root backups] [--port 8765]."""
import argparse
from pathlib import Path
from dataclasses import replace


def main():
    p = argparse.ArgumentParser(description='Локальный просмотр сохранённых карточек Kaiten')
    p.add_argument('--backup-root', type=Path)
    p.add_argument('--port', type=int, default=8765)
    a = p.parse_args()
    if not 1 <= a.port <= 65535:
        p.error('Порт должен быть от 1 до 65535')
    try:
        import uvicorn
        from backend.app.core.settings import Settings
        from backend.app.main import create_app
    except ImportError:
        p.error('Install dependencies: .venv/Scripts/python.exe -m pip install -e ".[dev]". '
                'Run with .venv/Scripts/python.exe viewer.py')
    settings = Settings.from_env()
    if a.backup_root:
        settings = replace(settings, backup_root=a.backup_root.resolve())
    print(f'http://127.0.0.1:{a.port}', flush=True)
    uvicorn.run(create_app(settings), host='127.0.0.1', port=a.port)


if __name__ == '__main__':
    main()
