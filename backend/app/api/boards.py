from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from backend.app.application.boards import BoardService


class BoardSummary(BaseModel):
    id: UUID
    title: str
    description: str | None
    sourceId: str | None


class BoardColumn(BaseModel):
    id: UUID
    title: str
    parentId: UUID | None
    sortOrder: str
    type: int | None
    wipLimit: int | None


class BoardLane(BaseModel):
    id: UUID
    title: str
    sortOrder: str


class BoardStructure(BaseModel):
    board: BoardSummary
    columns: list[BoardColumn]
    lanes: list[BoardLane]


def get_boards(request: Request) -> BoardService:
    return request.app.state.boards


Service = Annotated[BoardService, Depends(get_boards)]
router = APIRouter(prefix='/boards', tags=['Working boards'])


@router.get('', response_model=list[BoardSummary])
def boards(service: Service):
    return service.list_boards()


@router.get('/{board_id}/structure', response_model=BoardStructure)
def structure(board_id: UUID, service: Service):
    return service.structure(board_id)
