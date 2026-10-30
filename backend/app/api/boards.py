from typing import Annotated
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Query, HTTPException
from pydantic import BaseModel, StringConstraints, Field, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import FileResponse
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


class CardTag(BaseModel):
    id: UUID
    name: str
    color: str | None


class CardCover(BaseModel):
    id: UUID
    name: str
    url: str
    explicit: bool


class CardPreview(BaseModel):
    id: UUID
    number: str | None
    title: str
    columnId: UUID | None
    laneId: UUID | None
    sortOrder: str
    version: int
    asap: bool
    tags: list[CardTag]
    cover: CardCover | None
    members: list[dict[str, Any]] = Field(default_factory=list)


class CardPage(BaseModel):
    items: list[CardPreview]
    nextCursor: str | None


class CreateCard(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    columnId: UUID
    laneId: UUID | None = None
    requestId: UUID


class CreatedCard(BaseModel):
    id: UUID


class MoveNext(BaseModel):
    version: int = Field(ge=1)


class CommentFile(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data: str = Field(max_length=21 * 1024 * 1024)


class NewComment(BaseModel):
    requestId: UUID
    text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20000)] = ''
    files: list[CommentFile] = Field(default_factory=list, max_length=10)


class CardDetail(BaseModel):
    schemaVersion: int
    card: dict[str, Any]
    members: list[dict[str, Any]]
    subscribers: list[dict[str, Any]]
    tags: list[CardTag]
    properties: list[dict[str, Any]]
    checklists: list[dict[str, Any]]
    files: list[dict[str, Any]]
    imageMap: dict[str, str]
    comments: list[dict[str, Any]]
    history: list[dict[str, Any]]
    activity: list[dict[str, Any]]
    parents: list[dict[str, Any]]
    children: list[dict[str, Any]]
    links: list[dict[str, Any]]
    blockers: list[dict[str, Any]]
    extras: dict[str, Any]
    raw: dict[str, Any]
    source: dict[str, Any]


def get_boards(request: Request) -> BoardService:
    return request.app.state.boards


Service = Annotated[BoardService, Depends(get_boards)]
router = APIRouter(prefix='/boards', tags=['Working boards'])
images = APIRouter(tags=['Working files'])


@router.get('', response_model=list[BoardSummary])
def boards(service: Service):
    return service.list_boards()


@router.get('/{board_id}/structure', response_model=BoardStructure)
def structure(board_id: UUID, service: Service):
    return service.structure(board_id)


@router.get('/{board_id}/cards', response_model=CardPage)
def cards(board_id: UUID, column_id: UUID, service: Service, lane_id: UUID | None = None,
          limit: Annotated[int, Query(ge=1, le=100)] = 30,
          cursor: Annotated[str | None, Query(max_length=400)] = None,
          archived: bool = False, q: Annotated[str, Query(max_length=200)] = '', tag_id: Annotated[list[UUID] | None, Query()] = None):
    return service.cards(board_id, column_id, lane_id, limit, cursor, archived, q, tag_id)


@router.post('/{board_id}/cards', response_model=CreatedCard, status_code=201)
def create_card(board_id: UUID, body: CreateCard, service: Service, request: Request):
    return service.create_card(board_id, body.title, body.columnId, body.laneId, body.requestId, (request.state.identity or {}).get('userId'))


@images.get('/attachments/{attachment_id}/image')
def image(attachment_id: UUID, service: Service):
    path, name, mime = service.image(attachment_id)
    return FileResponse(path, media_type=mime, filename=name, content_disposition_type='inline')


@images.get('/cards/{card_id}/detail', response_model=CardDetail)
def card_detail(card_id: UUID, service: Service):
    return service.detail(card_id)


@images.post('/cards/{card_id}/move-next', response_model=CreatedCard)
def move_next(card_id: UUID, body: MoveNext, service: Service, request: Request):
    return service.move_next(card_id, body.version, (request.state.identity or {}).get('userId'))


@images.post('/cards/{card_id}/comments', response_model=CreatedCard, status_code=201)
async def add_comment(card_id: UUID, request: Request, service: Service):
    if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
        raise HTTPException(415, 'Используйте JSON для отправки комментария')
    # Bound the complete encoded body before parsing/decoding attachments.
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 22 * 1024 * 1024:
            raise HTTPException(413, 'Общий размер вложений — не более 15 МБ')
        data.extend(chunk)
    try:
        body = NewComment.model_validate_json(data)
    except ValidationError as error:
        raise HTTPException(422, 'Неверные данные комментария') from error
    return await run_in_threadpool(service.add_comment, card_id, body.requestId, body.text, body.files, (request.state.identity or {}).get('userId'))


@images.get('/attachments/{attachment_id}/content')
def attachment_content(attachment_id: UUID, service: Service, download: bool = False):
    path, name, mime = service.file(attachment_id)
    inline = mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'application/pdf') or mime.startswith(('video/', 'audio/'))
    return FileResponse(path, media_type=mime, filename=name, content_disposition_type='inline' if inline and not download else 'attachment')
