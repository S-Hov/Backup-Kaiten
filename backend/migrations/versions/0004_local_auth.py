"""Local accounts, sessions and source locations; no JSON import is performed."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0004_local_auth'
down_revision = '0003_sort_order'
branch_labels = None
depends_on = None


def entity_columns():
    # Frozen schema, independent of future changes to application ORM models.
    return [sa.Column('id', sa.Uuid(), primary_key=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('local_version', sa.Integer(), server_default='1', nullable=False)]


def upgrade():
    for name, kind in [('initials', sa.String(32)), ('timezone', sa.String(100)), ('language', sa.String(32)), ('avatar_url', sa.Text())]:
        op.add_column('users', sa.Column(name, kind))
    op.add_column('accounts', sa.Column('role', sa.String(20), server_default='member', nullable=False))
    op.add_column('accounts', sa.Column('last_login_at', sa.DateTime(timezone=True)))
    op.add_column('accounts', sa.Column('password_changed_at', sa.DateTime(timezone=True)))
    op.add_column('accounts', sa.Column('disabled_at', sa.DateTime(timezone=True)))
    op.create_table('login_sessions', *entity_columns(),
        sa.Column('account_id', sa.Uuid(), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('token_hash', sa.String(64), unique=True, nullable=False),
        sa.Column('csrf_hash', sa.String(64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True)),
        sa.Column('user_agent', sa.String(300), nullable=False))
    op.create_index('ix_login_sessions_account_id', 'login_sessions', ['account_id'])
    op.create_index('ix_login_sessions_expires_at', 'login_sessions', ['expires_at'])
    op.create_table('access_tokens', *entity_columns(),
        sa.Column('account_id', sa.Uuid(), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('token_hash', sa.String(64), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True)))
    op.create_index('ix_access_tokens_account_id', 'access_tokens', ['account_id'])
    op.create_table('auth_throttles',
        sa.Column('key', sa.String(64), primary_key=True),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False))
    op.create_table('auth_events', *entity_columns(),
        sa.Column('actor_id', sa.Uuid(), sa.ForeignKey('accounts.id')),
        sa.Column('subject_id', sa.Uuid(), sa.ForeignKey('accounts.id')),
        sa.Column('action', sa.String(80), nullable=False),
        sa.Column('data', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False))
    op.create_table('source_records', *entity_columns(),
        sa.Column('snapshot_id', sa.String(200), sa.ForeignKey('archive_snapshots.id'), nullable=False),
        sa.Column('entity_type', sa.String(60), nullable=False),
        sa.Column('entity_id', sa.Uuid(), nullable=False),
        sa.Column('relative_path', sa.Text(), nullable=False),
        sa.Column('json_pointer', sa.Text()),
        sa.UniqueConstraint('snapshot_id', 'entity_type', 'entity_id', 'relative_path', name='uq_source_records_location'))
    op.create_index('ix_source_records_snapshot_id', 'source_records', ['snapshot_id'])
    op.create_index('ix_source_records_entity_id', 'source_records', ['entity_id'])


def downgrade():
    for table in ('source_records', 'auth_events', 'auth_throttles', 'access_tokens', 'login_sessions'):
        op.drop_table(table)
    for column in ('disabled_at', 'password_changed_at', 'last_login_at', 'role'):
        op.drop_column('accounts', column)
    for column in ('avatar_url', 'language', 'timezone', 'initials'):
        op.drop_column('users', column)
