"""Preserve the fractional sort orders returned by Kaiten without rounding."""
from alembic import op
import sqlalchemy as sa

revision = '0003_sort_order'
down_revision = '0002_board'
branch_labels = None
depends_on = None

TABLES = ('space_boards', 'columns', 'lanes', 'cards', 'card_checklists',
          'checklist_items', 'property_options', 'attachments')


def change(old, new):
    if op.get_bind().dialect.name == 'sqlite':
        op.execute('PRAGMA defer_foreign_keys=ON')
    for name in TABLES:
        with op.batch_alter_table(name) as batch:
            batch.alter_column('sort_order', existing_type=old, type_=new, existing_nullable=False)


def upgrade():
    change(sa.Numeric(30, 10), sa.Numeric(50, 25))


def downgrade():
    # Downgrade can round values beyond ten fractional places.
    change(sa.Numeric(50, 25), sa.Numeric(30, 10))
