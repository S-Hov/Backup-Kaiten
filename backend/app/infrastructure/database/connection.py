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
            cursor = connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.close()
    return engine
