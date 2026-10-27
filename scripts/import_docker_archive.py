"""Stage only JSON inside Docker to avoid slow Windows bind-mount traversal."""
import argparse
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    return subprocess.run(args, cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description='Быстрый импорт JSON в PostgreSQL через Docker')
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--card-id', action='append', type=int,
                        help='Для проверки: перенести только указанные карточки')
    args = parser.parse_args()
    source = (ROOT / 'backups' / args.snapshot).resolve()
    if source.parent != (ROOT / 'backups').resolve() or not (source / 'cards').is_dir():
        parser.error('Укажите имя существующей папки снимка в backups/')
    if args.card_id and any(cid <= 0 or not (source / 'cards' / str(cid)).is_dir() for cid in args.card_id):
        parser.error('--card-id должен указывать существующую карточку')
    name = 'kaiten-import-' + uuid.uuid4().hex[:12]
    created = False
    with tempfile.TemporaryDirectory(prefix='kaiten-json-') as temp:
        archive = Path(temp) / 'archive.tar'
        print('Подготовка JSON без бинарных вложений...', flush=True)
        count = 0
        with tarfile.open(archive, 'w', format=tarfile.PAX_FORMAT) as output:
            for folder, dirs, files in os.walk(source, followlinks=False):
                if args.card_id and Path(folder) == source / 'cards':
                    selected = {str(cid) for cid in args.card_id}
                    dirs[:] = [d for d in dirs if d in selected]
                dirs[:] = [d for d in dirs if d != 'files' and not (Path(folder) / d).is_symlink()]
                for filename in files:
                    path = Path(folder) / filename
                    if path.suffix == '.json' and not path.is_symlink():
                        output.add(path, arcname=(Path(source.name) / path.relative_to(source)).as_posix(), recursive=False)
                        count += 1
                if count and count % 10000 < len(files):
                    print(f'Подготовлено JSON: {count}', flush=True)
        print(f'Подготовлено JSON: {count}; перенос в контейнер...', flush=True)
        try:
            run('docker', 'compose', 'run', '-d', '--name', name, '--entrypoint', 'sleep', 'tools', 'infinity')
            created = True
            run('docker', 'cp', str(archive), name + ':/tmp/archive.tar')
            run('docker', 'exec', name, 'python', '-c',
                "import tarfile; tarfile.open('/tmp/archive.tar').extractall('/tmp/kaiten-json', filter='data')")
            run('docker', 'exec', '-e', 'BOARD_BACKUP_ROOT=/tmp/kaiten-json', name,
                'python', '-m', 'backend.app.cli', 'import-archive', '--snapshot', source.name,
                *[value for cid in (args.card_id or []) for value in ('--card-id', str(cid))])
        finally:
            if created:
                subprocess.run(['docker', 'rm', '-f', name], cwd=ROOT, check=False)


if __name__ == '__main__':
    main()
