from typing import Annotated
from typing import Any, Literal
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Query, HTTPException
from pydantic import BaseModel, StringConstraints, Field, ValidationError, AwareDatetime, ConfigDict, model_validator
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


class FilterUser(BaseModel):
    id: UUID
    name: str
    avatarUrl: str | None


class BoardFilterOptions(BaseModel):
    tags: list[CardTag]
    users: list[FilterUser]


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
    total: int


class CreateCard(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    columnId: UUID
    laneId: UUID | None = None
    requestId: UUID


class CreatedCard(BaseModel):
    id: UUID


class MoveNext(BaseModel):
    version: int = Field(ge=1)


class MoveCard(MoveNext):
    columnId: UUID
    laneId: UUID | None
    beforeCardId: UUID | None = None
    afterCardId: UUID | None = None


class UpdateCard(MoveNext):
    model_config = ConfigDict(extra='forbid')
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None = None
    description: Annotated[str, StringConstraints(max_length=100000)] | None = None
    dueDate: AwareDatetime | None = None
    asap: bool | None = Field(default=None, strict=True)
    tagIds: list[UUID] | None = Field(default=None, max_length=200)
    members: list['EditMember'] | None = Field(default=None, max_length=200)
    subscriberIds: list[UUID] | None = Field(default=None, max_length=200)
    typeId: UUID | None = None
    sizeText: Annotated[str, StringConstraints(max_length=500)] | None = None
    size: Annotated[str, StringConstraints(max_length=100)] | None = None
    sizeUnit: Annotated[str, StringConstraints(max_length=100)] | None = None
    externalId: Annotated[str, StringConstraints(max_length=500)] | None = None
    plannedStart: AwareDatetime | None = None
    plannedEnd: AwareDatetime | None = None
    completedAt: AwareDatetime | None = None
    properties: list['EditProperty'] | None = Field(default=None, max_length=200)
    checklistItems: list['EditChecklistItem'] | None = Field(default=None, max_length=200)

    @model_validator(mode='after')
    def validate_changes(self):
        if not self.model_fields_set - {'version'}:
            raise ValueError('Измените хотя бы одно поле')
        for name in ('title', 'description', 'asap', 'tagIds', 'members', 'subscriberIds', 'properties', 'checklistItems'):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f'Поле {name} не может быть null')
        return self


class EditMember(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    role: Literal[1, 2] = 1


class EditProperty(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    value: Any


class EditChecklistItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)] | None = None
    checked: bool | None = Field(default=None, strict=True)


UpdateCard.model_rebuild()


class NewTag(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    requestId: UUID


class CardEditOptions(BoardFilterOptions):
    types: list[dict[str, Any]]
    properties: list[dict[str, Any]]


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


@router.get('/{board_id}/filter-options', response_model=BoardFilterOptions)
def filter_options(board_id: UUID, service: Service):
    return service.filter_options(board_id)


@router.get('/{board_id}/edit-options', response_model=CardEditOptions)
def edit_options(board_id: UUID, service: Service):
    return service.edit_options(board_id)


@router.post('/{board_id}/tags', response_model=CardTag)
def create_tag(board_id: UUID, body: NewTag, service: Service):
    return service.create_tag(board_id, body.name, body.requestId)


@router.get('/{board_id}/cards', response_model=CardPage)
def cards(board_id: UUID, column_id: UUID, service: Service, lane_id: UUID | None = None,
          limit: Annotated[int, Query(ge=1, le=100)] = 30,
          cursor: Annotated[str | None, Query(max_length=400)] = None,
          archived: bool = False, q: Annotated[str, Query(max_length=200)] = '', tag_id: Annotated[list[UUID] | None, Query()] = None,
          user_id: Annotated[list[UUID] | None, Query()] = None,
          date_field: Literal['created', 'updated', 'due'] = 'created',
          date_from: date | None = None, date_to: date | None = None,
          timezone_offset: Annotated[int, Query(ge=-840, le=840)] = 0):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, 'Начало периода должно быть не позже окончания')
    return service.cards(board_id, column_id, lane_id, limit, cursor, archived, q, tag_id, user_id, date_field, date_from, date_to, timezone_offset)


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


@images.post('/cards/{card_id}/move', response_model=CreatedCard)
def move_card(card_id: UUID, body: MoveCard, service: Service, request: Request):
    return service.move_card(card_id, body.version, body.columnId, body.laneId,
        body.beforeCardId, body.afterCardId, (request.state.identity or {}).get('userId'))


@images.post('/cards/{card_id}/edit', response_model=CreatedCard)
def update_card(card_id: UUID, body: UpdateCard, service: Service, request: Request):
    return service.update_card(card_id, body.version, body.model_dump(exclude_unset=True, exclude={'version'}),
        (request.state.identity or {}).get('userId'))


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
