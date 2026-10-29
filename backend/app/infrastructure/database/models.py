"""Immutable archive records. Future editable boards get separate tables."""
from typing import Any
from sqlalchemy import BigInteger, Boolean, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class ArchiveSnapshot(Base):
    __tablename__ = 'archive_snapshots'
    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON)
    dictionaries: Mapped[dict[str, Any]] = mapped_column(JSON)


class ArchiveCard(Base):
    __tablename__ = 'archive_cards'
    snapshot_id: Mapped[str] = mapped_column(ForeignKey('archive_snapshots.id'), primary_key=True)
    card_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    column_id: Mapped[int | None] = mapped_column(BigInteger)
    updated: Mapped[str | None] = mapped_column(String(64))
    search_text: Mapped[str] = mapped_column(Text)
    raw: Mapped[dict[str, Any]] = mapped_column(JSON)
    diagnostics: Mapped[list[str]] = mapped_column(JSON)


# Register the working model in the same Alembic metadata without changing the
# archive tables or making any queries/imports when the module is imported.
from . import board_models  # noqa: E402, F401
from . import auth_models  # noqa: E402, F401
