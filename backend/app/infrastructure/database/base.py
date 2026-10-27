"""Shared SQLAlchemy registry for archive and working tables."""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
