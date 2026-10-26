from typing import Any, Literal
from pydantic import BaseModel, Field


class SnapshotSummary(BaseModel):
    id: str
    boardId: int | None = None
    date: str | None = None
    cards: int | None = None
    files: int | None = None
    status: str
    issues: int = 0


class CardListItem(BaseModel):
    id: int
    title: str
    archived: bool = False
    columnId: int | None = None
    updated: str | None = None


class CardPage(BaseModel):
    items: list[CardListItem]
    total: int
    offset: int
    limit: int


class CardViewModel(BaseModel):
    """Stable UI contract; source-specific nested fields remain lossless."""
    schemaVersion: Literal[1]
    card: dict[str, Any]
    sections: dict[str, Any]
    files: list[dict[str, Any]]
    imageMap: dict[str, str]
    raw: dict[str, Any]
    diagnostics: list[str] = Field(default_factory=list)
    sectionStatus: dict[str, str]
    source: dict[str, Any]
