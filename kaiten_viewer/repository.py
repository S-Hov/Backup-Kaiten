"""Compatibility imports. New code lives in backend.app.infrastructure.archive."""
from backend.app.domain.ports import CardRepository as Repository
from backend.app.infrastructure.archive.repository import ArchiveRepository

__all__ = ['Repository', 'ArchiveRepository']
