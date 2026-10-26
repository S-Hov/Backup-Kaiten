"""Run: python viewer.py [--backup-root backups] [--port 8765]."""
import argparse
from pathlib import Path
from kaiten_viewer.repository import ArchiveRepository
from kaiten_viewer.server import create_server


def main():
    p = argparse.ArgumentParser(description='Локальный просмотр сохранённых карточек Kaiten')
    p.add_argument('--backup-root', type=Path, default=Path(__file__).parent / 'backups')
    p.add_argument('--port', type=int, default=8765)
    a = p.parse_args()
    if not 1 <= a.port <= 65535:
        p.error('Порт должен быть от 1 до 65535')
    repo = ArchiveRepository(a.backup_root)
    if not repo.snapshots():
        p.error('В указанной папке нет копий с каталогом cards')
    try:
        server = create_server(repo, a.port)
    except OSError:
        p.error('Порт занят. Выберите другой: --port 8766')
    print(f'Просмотрщик: http://127.0.0.1:{a.port}', flush=True)
    print('Для остановки нажмите Ctrl+C.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nПросмотрщик остановлен.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
