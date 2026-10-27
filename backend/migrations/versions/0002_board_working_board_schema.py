"""Working board schema"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0002_board'
down_revision = '0001_archive'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('file_objects',
    sa.Column('storage_key', sa.Text(), nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=True),
    sa.Column('hash_verified', sa.Boolean(), nullable=False),
    sa.Column('size', sa.BigInteger(), nullable=False),
    sa.Column('mime_type', sa.String(length=200), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.CheckConstraint('size >= 0', name='ck_files_nonnegative_size'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('storage_key')
    )
    op.create_index(op.f('ix_file_objects_sha256'), 'file_objects', ['sha256'], unique=False)
    op.create_table('roles',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('permissions', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('source_instances',
    sa.Column('origin', sa.String(length=300), nullable=False),
    sa.Column('company_id', sa.BigInteger(), nullable=True),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('origin')
    )
    op.create_table('card_types',
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('color', sa.String(length=64), nullable=True),
    sa.Column('letter', sa.String(length=16), nullable=True),
    sa.Column('description_template', sa.Text(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('settings', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_card_types_source')
    )
    op.create_index(op.f('ix_card_types_source_instance_id'), 'card_types', ['source_instance_id'], unique=False)
    op.create_table('checklists',
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('policy_id', sa.BigInteger(), nullable=True),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_checklists_source')
    )
    op.create_index(op.f('ix_checklists_source_instance_id'), 'checklists', ['source_instance_id'], unique=False)
    op.create_table('custom_properties',
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('type', sa.String(length=100), nullable=False),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('settings', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_custom_properties_source')
    )
    op.create_index(op.f('ix_custom_properties_source_instance_id'), 'custom_properties', ['source_instance_id'], unique=False)
    op.create_table('spaces',
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('settings', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_spaces_source')
    )
    op.create_index(op.f('ix_spaces_source_instance_id'), 'spaces', ['source_instance_id'], unique=False)
    op.create_table('tags',
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('color', sa.String(length=64), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_tags_source')
    )
    op.create_index(op.f('ix_tags_source_instance_id'), 'tags', ['source_instance_id'], unique=False)
    op.create_table('users',
    sa.Column('full_name', sa.Text(), nullable=False),
    sa.Column('email', sa.Text(), nullable=True),
    sa.Column('username', sa.Text(), nullable=True),
    sa.Column('activated', sa.Boolean(), nullable=False),
    sa.Column('virtual', sa.Boolean(), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_users_source')
    )
    op.create_index(op.f('ix_users_source_instance_id'), 'users', ['source_instance_id'], unique=False)
    op.create_table('accounts',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('login', sa.String(length=200), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('login'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('boards',
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('default_card_type_id', sa.Uuid(), nullable=True),
    sa.Column('settings', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['default_card_type_id'], ['card_types.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_boards_source')
    )
    op.create_index(op.f('ix_boards_source_instance_id'), 'boards', ['source_instance_id'], unique=False)
    op.create_table('checklist_items',
    sa.Column('checklist_id', sa.Uuid(), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('checked', sa.Boolean(), nullable=False),
    sa.Column('checker_id', sa.Uuid(), nullable=True),
    sa.Column('responsible_id', sa.Uuid(), nullable=True),
    sa.Column('checked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted', sa.Boolean(), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['checker_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['checklist_id'], ['checklists.id'], ),
    sa.ForeignKeyConstraint(['responsible_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_checklist_items_source')
    )
    op.create_index(op.f('ix_checklist_items_checklist_id'), 'checklist_items', ['checklist_id'], unique=False)
    op.create_index(op.f('ix_checklist_items_source_instance_id'), 'checklist_items', ['source_instance_id'], unique=False)
    op.create_table('property_options',
    sa.Column('property_id', sa.Uuid(), nullable=False),
    sa.Column('label', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['property_id'], ['custom_properties.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_property_options_source')
    )
    op.create_index(op.f('ix_property_options_property_id'), 'property_options', ['property_id'], unique=False)
    op.create_index(op.f('ix_property_options_source_instance_id'), 'property_options', ['source_instance_id'], unique=False)
    op.create_table('space_memberships',
    sa.Column('space_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('space_id', 'user_id')
    )
    op.create_table('columns',
    sa.Column('board_id', sa.Uuid(), nullable=False),
    sa.Column('parent_column_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('type', sa.Integer(), nullable=True),
    sa.Column('wip_limit', sa.Integer(), nullable=True),
    sa.Column('wip_limit_type', sa.Integer(), nullable=True),
    sa.Column('settings', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.CheckConstraint('parent_column_id IS NULL OR parent_column_id <> id', name='ck_columns_not_self'),
    sa.ForeignKeyConstraint(['board_id'], ['boards.id'], ),
    sa.ForeignKeyConstraint(['parent_column_id', 'board_id'], ['columns.id', 'columns.board_id'], name='fk_columns_parent_board', initially='DEFERRED', deferrable=True),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('id', 'board_id', name='uq_columns_board'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_columns_source')
    )
    op.create_index('ix_columns_position', 'columns', ['board_id', 'sort_order'], unique=False)
    op.create_index(op.f('ix_columns_source_instance_id'), 'columns', ['source_instance_id'], unique=False)
    op.create_table('lanes',
    sa.Column('board_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('wip_limit', sa.Integer(), nullable=True),
    sa.Column('default_card_type_id', sa.Uuid(), nullable=True),
    sa.Column('settings', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['board_id'], ['boards.id'], ),
    sa.ForeignKeyConstraint(['default_card_type_id'], ['card_types.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('id', 'board_id', name='uq_lanes_board'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_lanes_source')
    )
    op.create_index('ix_lanes_position', 'lanes', ['board_id', 'sort_order'], unique=False)
    op.create_index(op.f('ix_lanes_source_instance_id'), 'lanes', ['source_instance_id'], unique=False)
    op.create_table('space_boards',
    sa.Column('space_id', sa.Uuid(), nullable=False),
    sa.Column('board_id', sa.Uuid(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('placement', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.ForeignKeyConstraint(['board_id'], ['boards.id'], ),
    sa.ForeignKeyConstraint(['space_id'], ['spaces.id'], ),
    sa.PrimaryKeyConstraint('space_id', 'board_id')
    )
    op.create_table('cards',
    sa.Column('display_number', sa.BigInteger(), nullable=True),
    sa.Column('board_id', sa.Uuid(), nullable=False),
    sa.Column('column_id', sa.Uuid(), nullable=True),
    sa.Column('lane_id', sa.Uuid(), nullable=True),
    sa.Column('type_id', sa.Uuid(), nullable=True),
    sa.Column('owner_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('description_format', sa.String(length=20), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('asap', sa.Boolean(), nullable=False),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('due_date_time_present', sa.Boolean(), nullable=False),
    sa.Column('planned_start', sa.DateTime(timezone=True), nullable=True),
    sa.Column('planned_end', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_moved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('size', sa.Numeric(precision=30, scale=10), nullable=True),
    sa.Column('size_unit', sa.String(length=100), nullable=True),
    sa.Column('size_text', sa.Text(), nullable=True),
    sa.Column('external_id', sa.Text(), nullable=True),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.CheckConstraint('local_version > 0', name='ck_cards_positive_version'),
    sa.ForeignKeyConstraint(['board_id'], ['boards.id'], ),
    sa.ForeignKeyConstraint(['column_id', 'board_id'], ['columns.id', 'columns.board_id'], name='fk_cards_column_board'),
    sa.ForeignKeyConstraint(['lane_id', 'board_id'], ['lanes.id', 'lanes.board_id'], name='fk_cards_lane_board'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.ForeignKeyConstraint(['type_id'], ['card_types.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_cards_source')
    )
    op.create_index(op.f('ix_cards_owner_id'), 'cards', ['owner_id'], unique=False)
    op.create_index('ix_cards_position', 'cards', ['board_id', 'column_id', 'lane_id', 'sort_order', 'id'], unique=False)
    op.create_index(op.f('ix_cards_source_instance_id'), 'cards', ['source_instance_id'], unique=False)
    op.create_index(op.f('ix_cards_type_id'), 'cards', ['type_id'], unique=False)
    op.create_index('ix_cards_updated', 'cards', ['source_instance_id', 'source_updated_at'], unique=False)
    op.create_table('activity_events',
    sa.Column('source_id', sa.Text(), nullable=True),
    sa.Column('card_id', sa.Uuid(), nullable=True),
    sa.Column('author_id', sa.Uuid(), nullable=True),
    sa.Column('action', sa.String(length=150), nullable=False),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_activity_events_source')
    )
    op.create_index(op.f('ix_activity_events_source_instance_id'), 'activity_events', ['source_instance_id'], unique=False)
    op.create_index('ix_activity_timeline', 'activity_events', ['card_id', 'occurred_at', 'id'], unique=False)
    op.create_table('card_blockers',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('blocking_card_id', sa.Uuid(), nullable=True),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('released', sa.Boolean(), nullable=False),
    sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('released_by_id', sa.Uuid(), nullable=True),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['blocking_card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['released_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_card_blockers_source')
    )
    op.create_index(op.f('ix_card_blockers_card_id'), 'card_blockers', ['card_id'], unique=False)
    op.create_index(op.f('ix_card_blockers_source_instance_id'), 'card_blockers', ['source_instance_id'], unique=False)
    op.create_table('card_checklists',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('checklist_id', sa.Uuid(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['checklist_id'], ['checklists.id'], ),
    sa.PrimaryKeyConstraint('card_id', 'checklist_id')
    )
    op.create_index(op.f('ix_card_checklists_checklist_id'), 'card_checklists', ['checklist_id'], unique=False)
    op.create_table('card_location_history',
    sa.Column('source_id', sa.Text(), nullable=True),
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('board_id', sa.Uuid(), nullable=True),
    sa.Column('column_id', sa.Uuid(), nullable=True),
    sa.Column('subcolumn_id', sa.Uuid(), nullable=True),
    sa.Column('lane_id', sa.Uuid(), nullable=True),
    sa.Column('author_id', sa.Uuid(), nullable=True),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('source_condition', sa.Integer(), nullable=True),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['board_id'], ['boards.id'], ),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['column_id'], ['columns.id'], ),
    sa.ForeignKeyConstraint(['lane_id'], ['lanes.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.ForeignKeyConstraint(['subcolumn_id'], ['columns.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_card_location_history_source')
    )
    op.create_index(op.f('ix_card_location_history_source_instance_id'), 'card_location_history', ['source_instance_id'], unique=False)
    op.create_index('ix_location_history_timeline', 'card_location_history', ['card_id', 'changed_at', 'id'], unique=False)
    op.create_table('card_members',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.Integer(), nullable=False),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('card_id', 'user_id', 'role')
    )
    op.create_index(op.f('ix_card_members_user_id'), 'card_members', ['user_id'], unique=False)
    op.create_table('card_property_values',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('property_id', sa.Uuid(), nullable=False),
    sa.Column('value', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['property_id'], ['custom_properties.id'], ),
    sa.PrimaryKeyConstraint('card_id', 'property_id')
    )
    op.create_index(op.f('ix_card_property_values_property_id'), 'card_property_values', ['property_id'], unique=False)
    op.create_table('card_relations',
    sa.Column('parent_card_id', sa.Uuid(), nullable=False),
    sa.Column('child_card_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=30), nullable=False),
    sa.CheckConstraint('parent_card_id <> child_card_id', name='ck_relations_not_self'),
    sa.ForeignKeyConstraint(['child_card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['parent_card_id'], ['cards.id'], ),
    sa.PrimaryKeyConstraint('parent_card_id', 'child_card_id', 'kind')
    )
    op.create_index(op.f('ix_card_relations_child_card_id'), 'card_relations', ['child_card_id'], unique=False)
    op.create_table('card_subscribers',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('card_id', 'user_id')
    )
    op.create_index(op.f('ix_card_subscribers_user_id'), 'card_subscribers', ['user_id'], unique=False)
    op.create_table('card_tags',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('tag_id', sa.Uuid(), nullable=False),
    sa.Column('source_assignment_id', sa.BigInteger(), nullable=True),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ),
    sa.PrimaryKeyConstraint('card_id', 'tag_id')
    )
    op.create_index(op.f('ix_card_tags_tag_id'), 'card_tags', ['tag_id'], unique=False)
    op.create_table('comments',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('author_id', sa.Uuid(), nullable=True),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('text_format', sa.Integer(), nullable=False),
    sa.Column('edited', sa.Boolean(), nullable=False),
    sa.Column('deleted', sa.Boolean(), nullable=False),
    sa.Column('internal', sa.Boolean(), nullable=False),
    sa.Column('extra', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('id', 'card_id', name='uq_comments_card'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_comments_source')
    )
    op.create_index(op.f('ix_comments_author_id'), 'comments', ['author_id'], unique=False)
    op.create_index(op.f('ix_comments_source_instance_id'), 'comments', ['source_instance_id'], unique=False)
    op.create_index('ix_comments_timeline', 'comments', ['card_id', 'source_created_at', 'id'], unique=False)
    op.create_table('external_links',
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('url', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_id', sa.BigInteger(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'source_id', name='uq_external_links_source')
    )
    op.create_index(op.f('ix_external_links_card_id'), 'external_links', ['card_id'], unique=False)
    op.create_index(op.f('ix_external_links_source_instance_id'), 'external_links', ['source_instance_id'], unique=False)
    op.create_table('attachments',
    sa.Column('source_id', sa.Text(), nullable=True),
    sa.Column('card_id', sa.Uuid(), nullable=False),
    sa.Column('comment_id', sa.Uuid(), nullable=True),
    sa.Column('property_id', sa.Uuid(), nullable=True),
    sa.Column('file_object_id', sa.Uuid(), nullable=True),
    sa.Column('author_id', sa.Uuid(), nullable=True),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('sort_order', sa.Numeric(precision=30, scale=10), nullable=False),
    sa.Column('card_cover', sa.Boolean(), nullable=False),
    sa.Column('deleted', sa.Boolean(), nullable=False),
    sa.Column('external', sa.Boolean(), nullable=False),
    sa.Column('status', sa.String(length=40), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('source_instance_id', sa.Uuid(), nullable=True),
    sa.Column('source_uid', sa.String(length=64), nullable=True),
    sa.Column('source_created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('source_version', sa.BigInteger(), nullable=True),
    sa.Column('is_stub', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('source_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('local_version', sa.Integer(), server_default='1', nullable=False),
    sa.CheckConstraint('comment_id IS NULL OR property_id IS NULL', name='ck_attachment_single_owner'),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['card_id', 'property_id'], ['card_property_values.card_id', 'card_property_values.property_id'], name='fk_attachment_property_card'),
    sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ),
    sa.ForeignKeyConstraint(['comment_id', 'card_id'], ['comments.id', 'comments.card_id'], name='fk_attachment_comment_card'),
    sa.ForeignKeyConstraint(['file_object_id'], ['file_objects.id'], ),
    sa.ForeignKeyConstraint(['property_id'], ['custom_properties.id'], ),
    sa.ForeignKeyConstraint(['source_instance_id'], ['source_instances.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('source_instance_id', 'card_id', 'source_id', name='uq_attachments_source_card')
    )
    op.create_index('ix_attachments_card', 'attachments', ['card_id', 'sort_order'], unique=False)
    op.create_index(op.f('ix_attachments_file_object_id'), 'attachments', ['file_object_id'], unique=False)
    op.create_index(op.f('ix_attachments_source_instance_id'), 'attachments', ['source_instance_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_attachments_source_instance_id'), table_name='attachments')
    op.drop_index(op.f('ix_attachments_file_object_id'), table_name='attachments')
    op.drop_index('ix_attachments_card', table_name='attachments')
    op.drop_table('attachments')
    op.drop_index(op.f('ix_external_links_source_instance_id'), table_name='external_links')
    op.drop_index(op.f('ix_external_links_card_id'), table_name='external_links')
    op.drop_table('external_links')
    op.drop_index('ix_comments_timeline', table_name='comments')
    op.drop_index(op.f('ix_comments_source_instance_id'), table_name='comments')
    op.drop_index(op.f('ix_comments_author_id'), table_name='comments')
    op.drop_table('comments')
    op.drop_index(op.f('ix_card_tags_tag_id'), table_name='card_tags')
    op.drop_table('card_tags')
    op.drop_index(op.f('ix_card_subscribers_user_id'), table_name='card_subscribers')
    op.drop_table('card_subscribers')
    op.drop_index(op.f('ix_card_relations_child_card_id'), table_name='card_relations')
    op.drop_table('card_relations')
    op.drop_index(op.f('ix_card_property_values_property_id'), table_name='card_property_values')
    op.drop_table('card_property_values')
    op.drop_index(op.f('ix_card_members_user_id'), table_name='card_members')
    op.drop_table('card_members')
    op.drop_index('ix_location_history_timeline', table_name='card_location_history')
    op.drop_index(op.f('ix_card_location_history_source_instance_id'), table_name='card_location_history')
    op.drop_table('card_location_history')
    op.drop_index(op.f('ix_card_checklists_checklist_id'), table_name='card_checklists')
    op.drop_table('card_checklists')
    op.drop_index(op.f('ix_card_blockers_source_instance_id'), table_name='card_blockers')
    op.drop_index(op.f('ix_card_blockers_card_id'), table_name='card_blockers')
    op.drop_table('card_blockers')
    op.drop_index('ix_activity_timeline', table_name='activity_events')
    op.drop_index(op.f('ix_activity_events_source_instance_id'), table_name='activity_events')
    op.drop_table('activity_events')
    op.drop_index('ix_cards_updated', table_name='cards')
    op.drop_index(op.f('ix_cards_type_id'), table_name='cards')
    op.drop_index(op.f('ix_cards_source_instance_id'), table_name='cards')
    op.drop_index('ix_cards_position', table_name='cards')
    op.drop_index(op.f('ix_cards_owner_id'), table_name='cards')
    op.drop_table('cards')
    op.drop_table('space_boards')
    op.drop_index(op.f('ix_lanes_source_instance_id'), table_name='lanes')
    op.drop_index('ix_lanes_position', table_name='lanes')
    op.drop_table('lanes')
    op.drop_index(op.f('ix_columns_source_instance_id'), table_name='columns')
    op.drop_index('ix_columns_position', table_name='columns')
    op.drop_table('columns')
    op.drop_table('space_memberships')
    op.drop_index(op.f('ix_property_options_source_instance_id'), table_name='property_options')
    op.drop_index(op.f('ix_property_options_property_id'), table_name='property_options')
    op.drop_table('property_options')
    op.drop_index(op.f('ix_checklist_items_source_instance_id'), table_name='checklist_items')
    op.drop_index(op.f('ix_checklist_items_checklist_id'), table_name='checklist_items')
    op.drop_table('checklist_items')
    op.drop_index(op.f('ix_boards_source_instance_id'), table_name='boards')
    op.drop_table('boards')
    op.drop_table('accounts')
    op.drop_index(op.f('ix_users_source_instance_id'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_tags_source_instance_id'), table_name='tags')
    op.drop_table('tags')
    op.drop_index(op.f('ix_spaces_source_instance_id'), table_name='spaces')
    op.drop_table('spaces')
    op.drop_index(op.f('ix_custom_properties_source_instance_id'), table_name='custom_properties')
    op.drop_table('custom_properties')
    op.drop_index(op.f('ix_checklists_source_instance_id'), table_name='checklists')
    op.drop_table('checklists')
    op.drop_index(op.f('ix_card_types_source_instance_id'), table_name='card_types')
    op.drop_table('card_types')
    op.drop_table('source_instances')
    op.drop_table('roles')
    op.drop_index(op.f('ix_file_objects_sha256'), table_name='file_objects')
    op.drop_table('file_objects')
