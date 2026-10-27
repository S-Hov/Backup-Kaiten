"""Create the local Compose secret once; never print or overwrite its value."""
import secrets
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    target = root / '.secrets/postgres_password'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.parent.chmod(0o700)
    try:
        with target.open('x', encoding='ascii') as f:
            f.write(secrets.token_urlsafe(36) + '\n')
        # Compose file secrets are bind-mounted. A non-root container must be
        # able to read the file; the private parent protects it on the host.
        target.chmod(0o644)
        print('Создан локальный пароль PostgreSQL для Compose.')
    except FileExistsError:
        print('Пароль PostgreSQL уже существует, сохранён без изменений.')


if __name__ == '__main__':
    main()
