"""Local credentials, revocable sessions and provenance, separate from Kaiten ACLs."""
from datetime import datetime
from uuid import UUID
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base
from .board_models import Entity, Json


class LoginSession(Entity, Base):
    __tablename__ = 'login_sessions'
    account_id: Mapped[UUID] = mapped_column(ForeignKey('accounts.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str] = mapped_column(String(300), default='')


class AccessToken(Entity, Base):
    __tablename__ = 'access_tokens'
    account_id: Mapped[UUID] = mapped_column(ForeignKey('accounts.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthThrottle(Base):
    __tablename__ = 'auth_throttles'
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthEvent(Entity, Base):
    __tablename__ = 'auth_events'
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey('accounts.id'))
    subject_id: Mapped[UUID | None] = mapped_column(ForeignKey('accounts.id'))
    action: Mapped[str] = mapped_column(String(80))
    data: Mapped[dict] = mapped_column(Json, default=dict)


class SourceRecord(Entity, Base):
    __tablename__ = 'source_records'
    __table_args__ = (UniqueConstraint('snapshot_id', 'entity_type', 'entity_id', 'relative_path', name='uq_source_records_location'),)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey('archive_snapshots.id'), index=True)
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[UUID] = mapped_column(index=True)
    relative_path: Mapped[str] = mapped_column(Text)
    json_pointer: Mapped[str | None] = mapped_column(Text)
