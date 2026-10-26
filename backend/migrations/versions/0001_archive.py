"""Initial immutable archive schema."""
from alembic import op
import sqlalchemy as sa

revision = '0001_archive'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('archive_snapshots',
        sa.Column('id', sa.String(200), primary_key=True),
        sa.Column('summary', sa.JSON(), nullable=False),
        sa.Column('dictionaries', sa.JSON(), nullable=False))
    op.create_table('archive_cards',
        sa.Column('snapshot_id', sa.String(200), sa.ForeignKey('archive_snapshots.id'), primary_key=True),
        sa.Column('card_id', sa.BigInteger(), primary_key=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('archived', sa.Boolean(), nullable=False),
        sa.Column('column_id', sa.BigInteger(), nullable=True),
        sa.Column('updated', sa.String(64), nullable=True),
        sa.Column('search_text', sa.Text(), nullable=False),
        sa.Column('raw', sa.JSON(), nullable=False),
        sa.Column('diagnostics', sa.JSON(), nullable=False))


def downgrade():
    op.drop_table('archive_cards')
    op.drop_table('archive_snapshots')
