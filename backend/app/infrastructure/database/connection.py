from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url


def make_engine(database_url):
    url = make_url(database_url)
    kwargs = {'pool_pre_ping': True}
    if url.get_backend_name() == 'sqlite':
        if url.database and url.database != ':memory:':
            Path(url.database).resolve().parent.mkdir(parents=True, exist_ok=True)
        kwargs['connect_args'] = {'check_same_thread': False, 'timeout': 30}
    engine = create_engine(url, **kwargs)
    if url.get_backend_name() == 'sqlite':
        @event.listens_for(engine, 'connect')
        def foreign_keys(connection, record):
            # SQLite's built-in lower() only handles ASCII; match PostgreSQL for Russian search.
            connection.create_function('lower', 1, lambda value: value.lower() if value is not None else None, deterministic=True)
            cursor = connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.close()
    return engine
