import argparse
import json
import sys
from alembic import command
from alembic.config import Config
from backend.app.application.import_archive import import_archive
from backend.app.core.settings import PROJECT_ROOT, Settings
from backend.app.infrastructure.archive.repository import ArchiveRepository
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.repository import SqlCardRepository


def migrate(database_url):
    config = Config(str(PROJECT_ROOT / 'alembic.ini'))
    config.attributes['database_url'] = database_url
    command.upgrade(config, 'head')


def main():
    parser = argparse.ArgumentParser(description='Команды управления приложением')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('migrate', help='Применить миграции базы данных')
    imp = sub.add_parser('import-archive', help='Скопировать JSON архива в БД; вложения остаются на диске')
    imp.add_argument('--snapshot', required=True)
    imp.add_argument('--card-id', action='append', type=int)
    args = parser.parse_args()
    settings = Settings.from_env()
    if args.command == 'migrate':
        migrate(settings.database_url)
        print('Миграции применены.')
        return
    if args.card_id and any(cid <= 0 for cid in args.card_id):
        parser.error('--card-id должен быть положительным')
    engine = make_engine(settings.database_url)
    try:
        result = import_archive(ArchiveRepository(settings.backup_root),
                                SqlCardRepository(engine), args.snapshot, args.card_id,
                                on_progress=lambda n: print(f'Импортировано: {n}', file=sys.stderr, flush=True)
                                if n % 1000 == 0 else None)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result['issues']:
            raise SystemExit(2)
    finally:
        engine.dispose()


if __name__ == '__main__':
    main()
