"""Separate imported avatars from local profile choices."""
from alembic import op
import sqlalchemy as sa

revision = '0005_user_avatars'
down_revision = '0004_local_auth'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('user_avatars',
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('imported_file_id', sa.Uuid(), sa.ForeignKey('file_objects.id')),
        sa.Column('custom_file_id', sa.Uuid(), sa.ForeignKey('file_objects.id')),
        sa.Column('imported_source_hash', sa.String(64)),
        sa.Column('mode', sa.String(16), nullable=False, server_default='imported'),
        sa.CheckConstraint("mode IN ('imported', 'custom', 'initials')", name='ck_user_avatar_mode'))


def downgrade():
    op.drop_table('user_avatars')
