from alembic import context
from backend.app.core.settings import Settings
from backend.app.infrastructure.database.connection import make_engine
from backend.app.infrastructure.database.models import Base

target_metadata = Base.metadata
url = context.config.attributes.get('database_url') or Settings.from_env().database_url

if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = make_engine(url)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata,
                              compare_type=True)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
