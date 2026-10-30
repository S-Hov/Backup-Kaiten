from uuid import UUID
from sqlalchemy import ForeignKey, String, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class UserAvatar(Base):
    __tablename__ = 'user_avatars'
    __table_args__ = (CheckConstraint("mode IN ('imported', 'custom', 'initials')", name='ck_user_avatar_mode'),)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id'), primary_key=True)
    imported_file_id: Mapped[UUID | None] = mapped_column(ForeignKey('file_objects.id'))
    custom_file_id: Mapped[UUID | None] = mapped_column(ForeignKey('file_objects.id'))
    imported_source_hash: Mapped[str | None] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(16), default='imported', server_default='imported')


def avatar_url(user_id, avatar):
    if avatar is None or avatar.mode == 'initials':
        return None
    file_id = avatar.custom_file_id if avatar.mode == 'custom' else avatar.imported_file_id
    return f'/api/v1/users/{user_id}/avatar?v={file_id}' if file_id else None
