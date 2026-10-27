"""Offline JSON -> working PostgreSQL tables. Does not contact Kaiten."""
from backend.app.update_database import main


if __name__ == '__main__':
    raise SystemExit(main())
