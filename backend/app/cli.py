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
    sub.add_parser('enrich-existing', help='Дополнить профили и происхождение по уже сохранённым SQL-данным')
    invite = sub.add_parser('invite-user', help='Подготовить одноразовую ссылку установки пароля')
    invite.add_argument('--email', required=True)
    invite.add_argument('--role', choices=['admin', 'member', 'viewer'], default='member')
    invite.add_argument('--base-url', default='http://127.0.0.1:8766')
    imp = sub.add_parser('import-archive', help='Скопировать JSON архива в БД; вложения остаются на диске')
    imp.add_argument('--snapshot', required=True)
    imp.add_argument('--card-id', action='append', type=int)
    from backend.app.update_database import add_arguments, run
    add_arguments(sub.add_parser('update-board', help='Обновить рабочие таблицы из существующих JSON'))
    args = parser.parse_args()
    settings = Settings.from_env()
    if args.command == 'migrate':
        migrate(settings.database_url)
        print('Миграции применены.')
        return
    if args.command == 'update-board':
        raise SystemExit(run(args))
    if args.command in ('enrich-existing', 'invite-user'):
        engine = make_engine(settings.database_url)
        try:
            if args.command == 'enrich-existing':
                from backend.app.application.enrich_existing import enrich_existing
                print(json.dumps(enrich_existing(engine), ensure_ascii=False))
            else:
                from backend.app.application.auth import AuthService
                from urllib.parse import urlsplit
                parsed = urlsplit(args.base_url)
                if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment or parsed.username:
                    parser.error('Неверный base-url')
                result = AuthService(engine).invite(args.email, args.role)
                print(f"Ссылка для {result['email']} (24 часа): {args.base_url.rstrip('/')}/activate#token={result['token']}")
        finally:
            engine.dispose()
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
