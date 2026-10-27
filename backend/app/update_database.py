"""CLI shared by update_database.py and `tools update-board`."""
import argparse
import json
from pathlib import Path
import sys
import tempfile

from sqlalchemy.exc import SQLAlchemyError

from backend.app.application.update_board import update_board
from backend.app.core.settings import Settings
from backend.app.infrastructure.archive.repository import ArchiveRepository
from backend.app.infrastructure.database.connection import make_engine


def add_arguments(parser):
    parser.add_argument('--snapshot', required=True, help='Имя папки снимка в backups/')
    parser.add_argument('--card-id', action='append', type=int, help='Обработать выбранную карточку; можно повторять')
    parser.add_argument('--limit-cards', type=int)
    parser.add_argument('--batch-size', type=int, default=50)
    parser.add_argument('--origin', help='Адрес компании; обычно берётся из report.json')
    parser.add_argument('--backup-root', type=Path, help='Другой каталог JSON-архивов')
    parser.add_argument('--plan', action='store_true', help='Показать объём работы без подключения к БД')
    parser.add_argument('--verify-files', action='store_true', help='Проверять также SHA-256 файлов')
    parser.add_argument('--overwrite-local', action='store_true', help='Разрешить перезапись локальных правок; старые версии всё равно пропускаются')
    parser.add_argument('--report', type=Path, help='Дополнительно записать JSON-отчёт в файл')


def execute(args):
    settings = Settings.from_env()
    root = (args.backup_root or settings.backup_root).resolve()
    report_path = args.report.resolve() if args.report else None
    if report_path and report_path.is_relative_to(root):
        raise ValueError('Отчёт нельзя сохранять внутрь исходного архива')
    if report_path:
        # Validate the destination before touching the database.
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=report_path.parent):
            pass
        if report_path.exists():
            raise ValueError('Файл отчёта уже существует; укажите новое имя')
    engine = None if args.plan else make_engine(settings.database_url)
    try:
        result = update_board(ArchiveRepository(root), engine, args.snapshot,
            card_ids=args.card_id, limit=args.limit_cards, origin=args.origin, batch_size=args.batch_size,
            verify_files=args.verify_files, overwrite_local=args.overwrite_local, plan=args.plan,
            progress=lambda done, total, saved: print(f'Обработано: {done}/{total}; сохранено: {saved}', file=sys.stderr, flush=True))
    finally:
        if engine is not None:
            engine.dispose()
    output = json.dumps(result, ensure_ascii=False, indent=2)
    print(output)
    if report_path:
        with report_path.open('x', encoding='utf-8') as stream:
            stream.write(output + '\n')
    return 2 if result['errors'] or result['conflicts'] else 0


def run(args):
    try:
        return execute(args)
    except (OSError, ValueError, SQLAlchemyError) as error:
        message = str(error) if type(error) is ValueError else f'{type(error).__name__}: проверьте пути, подключение и миграции'
        print(f'Ошибка: {message}', file=sys.stderr)
        return 1


def main(argv=None):
    parser = argparse.ArgumentParser(description='Обновить рабочие таблицы БД из существующего JSON-архива')
    add_arguments(parser)
    return run(parser.parse_args(argv))


if __name__ == '__main__':
    raise SystemExit(main())
