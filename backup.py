"""Command line entry point, Python 3.11+, standard library only."""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from kaiten_backup.catalog import CARD, BOARD, LOCAL, FULL, ALL
from kaiten_backup.config import load_config
from kaiten_backup.client import Client, BackupError
from kaiten_backup.storage import Store
from kaiten_backup.exporter import Exporter


def parser():
    p = argparse.ArgumentParser(description='Резервная копия Kaiten. Только GET; данные сервиса не изменяются.')
    p.add_argument('--config', default=str(Path(__file__).with_name('config.toml')), help='TOML-конфиг')
    p.add_argument('--list-functions', action='store_true', help='Показать каталог функций без подключения')
    p.add_argument('--list-boards', action='store_true', help='Получить названия и ID досок пространства из board_url')
    p.add_argument('--plan', action='store_true', help='Проверить конфиг и показать план без сети и токена')
    p.add_argument('--full-cards', action='store_true', help='Карточки, все поддержанные связи, файлы и справочники полей')
    p.add_argument('--all', action='store_true', help='Полные карточки плюс структура доски и справочники')
    p.add_argument('--exclude', action='append', choices=sorted(ALL), default=[],
                   help='Исключить функцию из выбранной группы; можно повторить, например --exclude sla')
    for name, e in {**BOARD, **CARD, **LOCAL}.items():
        p.add_argument('--' + name, action='store_true', help=e if isinstance(e, str) else e.description)
    p.add_argument('--card-id', action='append', type=int, help='ID отдельной карточки; можно повторить')
    p.add_argument('--limit-cards', type=int, help='Ограничить число карточек для пробного запуска')
    p.add_argument('--active-only', action='store_true', help='Только неархивные карточки')
    p.add_argument('--follow-related', action='store_true', help='Также выгружать связанные карточки других досок')
    p.add_argument('--resume', type=Path, help='Продолжить конкретную папку копии с теми же флагами')
    p.add_argument('--verify', type=Path, help='Проверить контрольные суммы готовой копии без сети')
    return p


def main(argv=None):
    p = parser()
    a = p.parse_args(argv)
    if a.list_functions:
        for group, catalog in [('Доска', BOARD), ('Карточки', CARD), ('Из карточки', LOCAL)]:
            print(group + ':')
            for name, e in catalog.items():
                print(f'  --{name:14} ' + (e if isinstance(e, str) else f'{e.description}: GET {e.path} [{e.mode}]'))
        return 0
    if a.list_boards:
        if a.plan:
            p.error('--list-boards обращается к API и не совмещается с --plan')
        cfg = load_config(a.config, require_board=False)
        k = cfg['kaiten']
        if not k.get('space_id'):
            p.error('Для --list-boards укажите board_url со ссылкой /space/ID/boards')
        client = Client(k['origin'], k['token'], cfg['performance'])
        boards = client.fetch(f'/spaces/{k["space_id"]}/boards')
        if not isinstance(boards, list):
            raise BackupError('Ожидался список досок от API')
        print(f'Пространство {k["space_id"]}. Досок: {len(boards)}')
        for board in boards:
            bid = board.get('board_id') or board.get('id')
            title = str(board.get('title', '')).replace('\r', ' ').replace('\n', ' ')
            print(f'  board_id = {bid}    {title}')
        print('Укажите ID нужной доски в config.toml, затем повторите --all --plan.')
        return 0
    if a.verify:
        from kaiten_backup.storage import digest
        state = json.loads((a.verify / 'state.json').read_text(encoding='utf-8'))
        bad = []
        root = a.verify.resolve()
        for key, record in state['completed'].items():
            path = (root / record['path']).resolve()
            if not path.is_relative_to(root) or not path.is_file() or digest(path) != record['sha256']:
                bad.append(key)
        print(f'Проверено: {len(state["completed"])}. Ошибок: {len(bad)}')
        for key in bad:
            print('  ' + key)
        print('Проверка подтверждает целостность сохранённых файлов, а не полноту данных Kaiten.')
        return 2 if bad else 0
    selected = {name for name in ALL if getattr(a, name.replace('-', '_'), False)}
    if a.all:
        selected |= ALL
    if a.full_cards:
        selected |= FULL
    selected -= set(a.exclude)
    if not selected:
        p.error('Выберите --all, --full-cards или отдельные функции; справка: --help')
    if a.limit_cards is not None and a.limit_cards <= 0:
        p.error('--limit-cards должен быть положительным')
    if a.card_id and any(i <= 0 for i in a.card_id):
        p.error('--card-id должен быть положительным')
    # Files require comments for resolving protected comment attachment UIDs.
    if 'files' in selected:
        if set(a.exclude) & {'comments', 'fields'}:
            p.error('--files требует comments и fields; их нельзя исключить при скачивании файлов')
        selected |= {'comments', 'fields'}
    cfg = load_config(a.config, require_token=not a.plan)
    if a.active_only:
        cfg['backup']['include_archived'] = False
    if a.follow_related:
        cfg['backup']['follow_related'] = True
    identity = dict(origin=cfg['kaiten']['origin'], board_id=cfg['kaiten']['board_id'],
                    selected=sorted(selected), card_ids=sorted(set(a.card_id or [])),
                    limit=a.limit_cards, include_archived=cfg['backup']['include_archived'],
                    follow_related=cfg['backup']['follow_related'],
                    max_related_cards=cfg['backup']['max_related_cards'],
                    extra_asset_hosts=cfg['backup']['extra_asset_hosts'])
    if a.plan:
        print(json.dumps(identity, ensure_ascii=False, indent=2))
        print(f'Максимальная частота: {cfg["performance"]["requests_per_second"]} запросов/с')
        return 0
    root = a.resume or (Path(cfg['backup']['output_dir']) /
                        (datetime.now(timezone.utc).strftime('%Y-%m-%d_%H-%M-%S_%fZ') +
                         f'_board_{cfg["kaiten"]["board_id"]}'))
    store = Store(root, identity, resume=bool(a.resume))
    print(f'Папка копии: {store.root}', flush=True)
    client = Client(cfg['kaiten']['origin'], cfg['kaiten']['token'], cfg['performance'])
    report = Exporter(client, store, cfg, selected, identity['card_ids'], a.limit_cards).run()
    print(f'Статус: {report["status"]}; карточек: {report["cards_saved"]}; файлов: {report["files_saved"]}')
    return 2 if report['issues'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\nОстановлено. Продолжить: те же флаги плюс --resume ПАПКА_КОПИИ', file=sys.stderr)
        sys.exit(130)
    except (ValueError, KeyError, OSError, BackupError) as e:
        # Do not print arbitrary exception text that may contain secrets.
        print(f'Ошибка ({type(e).__name__}). Проверьте конфиг, токен и права на папку.', file=sys.stderr)
        if isinstance(e, ValueError) and not isinstance(e, json.JSONDecodeError):
            print(str(e), file=sys.stderr)
        sys.exit(1)
