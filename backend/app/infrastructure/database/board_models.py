"""Working board schema. Kept separate from the original archive tables.

No import or synchronization is triggered by declaring these models.
JSON becomes JSONB on PostgreSQL; SQLite remains available for isolated tests.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey,
                        ForeignKeyConstraint, Index, Integer, JSON, Numeric, String,
                        Text, UniqueConstraint, Uuid, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from .base import Base


Json = JSON().with_variant(JSONB(), 'postgresql')


class Entity:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                               onupdate=lambda: datetime.now(timezone.utc))
    local_version: Mapped[int] = mapped_column(Integer, default=1, server_default='1')


class Imported(Entity):
    source_instance_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('source_instances.id'), index=True)
    source_id: Mapped[int | None] = mapped_column(BigInteger)
    source_uid: Mapped[str | None] = mapped_column(String(64))
    source_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_version: Mapped[int | None] = mapped_column(BigInteger)
    is_stub: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    source_data: Mapped[dict[str, Any]] = mapped_column(Json, default=dict)

    @declared_attr.directive
    def __table_args__(cls):
        return (UniqueConstraint('source_instance_id', 'source_id', name=f'uq_{cls.__tablename__}_source'),)


class SourceInstance(Entity, Base):
    __tablename__ = 'source_instances'
    origin: Mapped[str] = mapped_column(String(300), unique=True)
    company_id: Mapped[int | None] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(Text, default='')


class Space(Imported, Base):
    __tablename__ = 'spaces'
    title: Mapped[str] = mapped_column(Text, default='')
    settings: Mapped[dict] = mapped_column(Json, default=dict)


class CardType(Imported, Base):
    __tablename__ = 'card_types'
    name: Mapped[str] = mapped_column(Text, default='')
    color: Mapped[str | None] = mapped_column(String(64))
    letter: Mapped[str | None] = mapped_column(String(16))
    description_template: Mapped[str | None] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(Json, default=dict)


class Board(Imported, Base):
    __tablename__ = 'boards'
    title: Mapped[str] = mapped_column(Text, default='')
    description: Mapped[str | None] = mapped_column(Text)
    default_card_type_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('card_types.id'))
    settings: Mapped[dict] = mapped_column(Json, default=dict)


class SpaceBoard(Base):
    __tablename__ = 'space_boards'
    space_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('spaces.id'), primary_key=True)
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('boards.id'), primary_key=True)
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)
    placement: Mapped[dict] = mapped_column(Json, default=dict)


class Column(Imported, Base):
    __tablename__ = 'columns'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'source_id', name='uq_columns_source'),
        UniqueConstraint('id', 'board_id', name='uq_columns_board'),
        ForeignKeyConstraint(['parent_column_id', 'board_id'], ['columns.id', 'columns.board_id'],
                             name='fk_columns_parent_board', deferrable=True, initially='DEFERRED'),
        CheckConstraint('parent_column_id IS NULL OR parent_column_id <> id', name='ck_columns_not_self'),
        Index('ix_columns_position', 'board_id', 'sort_order'),
    )
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('boards.id'))
    parent_column_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    title: Mapped[str] = mapped_column(Text, default='')
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)
    type: Mapped[int | None] = mapped_column(Integer)
    wip_limit: Mapped[int | None] = mapped_column(Integer)
    wip_limit_type: Mapped[int | None] = mapped_column(Integer)
    settings: Mapped[dict] = mapped_column(Json, default=dict)


class Lane(Imported, Base):
    __tablename__ = 'lanes'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'source_id', name='uq_lanes_source'),
        UniqueConstraint('id', 'board_id', name='uq_lanes_board'),
        Index('ix_lanes_position', 'board_id', 'sort_order'),
    )
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('boards.id'))
    title: Mapped[str] = mapped_column(Text, default='')
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)
    wip_limit: Mapped[int | None] = mapped_column(Integer)
    default_card_type_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('card_types.id'))
    settings: Mapped[dict] = mapped_column(Json, default=dict)


class User(Imported, Base):
    __tablename__ = 'users'
    full_name: Mapped[str] = mapped_column(Text, default='')
    email: Mapped[str | None] = mapped_column(Text)
    username: Mapped[str | None] = mapped_column(Text)
    activated: Mapped[bool] = mapped_column(Boolean, default=True)
    virtual: Mapped[bool] = mapped_column(Boolean, default=False)


class Role(Entity, Base):
    __tablename__ = 'roles'
    name: Mapped[str] = mapped_column(String(100), unique=True)
    permissions: Mapped[list[str]] = mapped_column(Json, default=list)


class Account(Entity, Base):
    """Local authentication only; never copy Kaiten ACL masks or credentials here."""
    __tablename__ = 'accounts'
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), unique=True)
    login: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=False)


class SpaceMembership(Base):
    __tablename__ = 'space_memberships'
    space_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('spaces.id'), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('roles.id'))


class Card(Imported, Base):
    __tablename__ = 'cards'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'source_id', name='uq_cards_source'),
        ForeignKeyConstraint(['column_id', 'board_id'], ['columns.id', 'columns.board_id'], name='fk_cards_column_board'),
        ForeignKeyConstraint(['lane_id', 'board_id'], ['lanes.id', 'lanes.board_id'], name='fk_cards_lane_board'),
        CheckConstraint('local_version > 0', name='ck_cards_positive_version'),
        Index('ix_cards_position', 'board_id', 'column_id', 'lane_id', 'sort_order', 'id'),
        Index('ix_cards_updated', 'source_instance_id', 'source_updated_at'),
    )
    display_number: Mapped[int | None] = mapped_column(BigInteger)
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('boards.id'))
    column_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    lane_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    type_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('card_types.id'), index=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'), index=True)
    title: Mapped[str] = mapped_column(Text, default='')
    description: Mapped[str] = mapped_column(Text, default='')
    description_format: Mapped[str] = mapped_column(String(20), default='markdown')
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)
    asap: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date_time_present: Mapped[bool] = mapped_column(Boolean, default=False)
    planned_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    planned_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_moved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    size: Mapped[Decimal | None] = mapped_column(Numeric(30, 10))
    size_unit: Mapped[str | None] = mapped_column(String(100))
    size_text: Mapped[str | None] = mapped_column(Text)
    external_id: Mapped[str | None] = mapped_column(Text)


class CardMember(Base):
    __tablename__ = 'card_members'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), primary_key=True, index=True)
    role: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int | None] = mapped_column(BigInteger)


class CardSubscriber(Base):
    __tablename__ = 'card_subscribers'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), primary_key=True, index=True)


class Tag(Imported, Base):
    __tablename__ = 'tags'
    name: Mapped[str] = mapped_column(Text, default='')
    color: Mapped[str | None] = mapped_column(String(64))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class CardTag(Base):
    __tablename__ = 'card_tags'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('tags.id'), primary_key=True, index=True)
    source_assignment_id: Mapped[int | None] = mapped_column(BigInteger)


class Comment(Imported, Base):
    __tablename__ = 'comments'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'source_id', name='uq_comments_source'),
        UniqueConstraint('id', 'card_id', name='uq_comments_card'),
        Index('ix_comments_timeline', 'card_id', 'source_created_at', 'id'),
    )
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'))
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'), index=True)
    text: Mapped[str] = mapped_column(Text, default='')
    text_format: Mapped[int] = mapped_column(Integer, default=1)
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    internal: Mapped[bool] = mapped_column(Boolean, default=False)
    extra: Mapped[dict] = mapped_column(Json, default=dict)


class Checklist(Imported, Base):
    __tablename__ = 'checklists'
    name: Mapped[str] = mapped_column(Text, default='')
    policy_id: Mapped[int | None] = mapped_column(BigInteger)


class CardChecklist(Base):
    __tablename__ = 'card_checklists'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True)
    checklist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('checklists.id'), primary_key=True, index=True)
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)


class ChecklistItem(Imported, Base):
    __tablename__ = 'checklist_items'
    checklist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('checklists.id'), index=True)
    text: Mapped[str] = mapped_column(Text, default='')
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    checker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)


class CardRelation(Base):
    __tablename__ = 'card_relations'
    __table_args__ = (CheckConstraint('parent_card_id <> child_card_id', name='ck_relations_not_self'),)
    parent_card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True)
    child_card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True, index=True)
    kind: Mapped[str] = mapped_column(String(30), primary_key=True, default='parent_child')


class CardBlocker(Imported, Base):
    __tablename__ = 'card_blockers'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), index=True)
    blocking_card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('cards.id'))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))
    reason: Mapped[str] = mapped_column(Text, default='')
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released: Mapped[bool] = mapped_column(Boolean, default=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))


class ExternalLink(Imported, Base):
    __tablename__ = 'external_links'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), index=True)
    url: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)


class CustomProperty(Imported, Base):
    __tablename__ = 'custom_properties'
    name: Mapped[str] = mapped_column(Text, default='')
    type: Mapped[str] = mapped_column(String(100))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    settings: Mapped[dict] = mapped_column(Json, default=dict)


class PropertyOption(Imported, Base):
    __tablename__ = 'property_options'
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('custom_properties.id'), index=True)
    label: Mapped[str] = mapped_column(Text, default='')
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)


class CardPropertyValue(Base):
    __tablename__ = 'card_property_values'
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'), primary_key=True)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('custom_properties.id'), primary_key=True, index=True)
    value: Mapped[Any] = mapped_column(Json, nullable=False)


class FileObject(Entity, Base):
    __tablename__ = 'file_objects'
    __table_args__ = (CheckConstraint('size >= 0', name='ck_files_nonnegative_size'),)
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    hash_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    size: Mapped[int] = mapped_column(BigInteger)
    mime_type: Mapped[str | None] = mapped_column(String(200))


class Attachment(Imported, Base):
    __tablename__ = 'attachments'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'card_id', 'source_id', name='uq_attachments_source_card'),
        ForeignKeyConstraint(['comment_id', 'card_id'], ['comments.id', 'comments.card_id'], name='fk_attachment_comment_card'),
        ForeignKeyConstraint(['card_id', 'property_id'], ['card_property_values.card_id', 'card_property_values.property_id'], name='fk_attachment_property_card'),
        CheckConstraint('comment_id IS NULL OR property_id IS NULL', name='ck_attachment_single_owner'),
        Index('ix_attachments_card', 'card_id', 'sort_order'),
    )
    source_id: Mapped[str | None] = mapped_column(Text)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'))
    comment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    property_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('custom_properties.id'))
    file_object_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('file_objects.id'), index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))
    name: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[Decimal] = mapped_column(Numeric(30, 10), default=0)
    card_cover: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    external: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(40), default='not_exported')
    error: Mapped[str | None] = mapped_column(Text)


class CardLocationHistory(Imported, Base):
    __tablename__ = 'card_location_history'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'source_id', name='uq_card_location_history_source'),
        Index('ix_location_history_timeline', 'card_id', 'changed_at', 'id'),
    )
    source_id: Mapped[str | None] = mapped_column(Text)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('cards.id'))
    board_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('boards.id'))
    column_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('columns.id'))
    subcolumn_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('columns.id'))
    lane_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('lanes.id'))
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_condition: Mapped[int | None] = mapped_column(Integer)


class ActivityEvent(Imported, Base):
    __tablename__ = 'activity_events'
    __table_args__ = (
        UniqueConstraint('source_instance_id', 'source_id', name='uq_activity_events_source'),
        Index('ix_activity_timeline', 'card_id', 'occurred_at', 'id'),
    )
    source_id: Mapped[str | None] = mapped_column(Text)
    card_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('cards.id'))
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('users.id'))
    action: Mapped[str] = mapped_column(String(150))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    data: Mapped[dict] = mapped_column(Json, default=dict)
