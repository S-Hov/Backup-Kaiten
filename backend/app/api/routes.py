import mimetypes
from typing import Annotated
from fastapi import APIRouter, Depends, Query, Request
from starlette.responses import FileResponse
from backend.app.application.cards import CardService
from .schemas import CardPage, CardViewModel, SnapshotSummary
from .boards import get_boards
from backend.app.application.boards import BoardService


def get_service(request: Request) -> CardService:
    return request.app.state.cards


Service = Annotated[CardService, Depends(get_service)]
Snapshot = Annotated[str, Query(min_length=1, max_length=200)]
router = APIRouter()
assets = APIRouter()


@router.get('/health', tags=['System'])
def health():
    return {'status': 'ok', 'apiVersion': 1}


@router.get('/ready', tags=['System'])
def ready(service: Service, boards: Annotated[BoardService, Depends(get_boards)]):
    # Unlike liveness, this touches the configured repository and its schema.
    service.snapshots()
    boards.list_boards()
    return {'status': 'ready'}


@router.get('/snapshots', response_model=list[SnapshotSummary], tags=['Archive'])
def snapshots(service: Service):
    return service.snapshots()


@router.get('/cards', response_model=CardPage, tags=['Cards'])
def search_cards(service: Service, snapshot: Snapshot, q: str = '',
                 offset: Annotated[int, Query(ge=0)] = 0,
                 limit: Annotated[int, Query(ge=1, le=100)] = 40):
    return service.search(snapshot, q, offset, limit)


@router.get('/cards/{card_id}', response_model=CardViewModel, tags=['Cards'])
def get_card(service: Service, card_id: int, snapshot: Snapshot, request: Request):
    if card_id <= 0:
        raise ValueError('Номер карточки должен быть положительным')
    return request.app.state.avatars.enrich_archive(service.get_card(snapshot, card_id))


@assets.get('/assets/{snapshot}/{card_id}/{index}', tags=['Files'])
def attachment(service: Service, snapshot: str, card_id: int, index: int,
               download: bool = False):
    path, name = service.get_attachment(snapshot, card_id, index)
    mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    inline = mime.startswith(('image/', 'video/', 'audio/')) or mime == 'application/pdf'
    disposition = 'attachment' if download or not inline or mime == 'image/svg+xml' else 'inline'
    return FileResponse(path, media_type=mime, filename=name,
                        content_disposition_type=disposition)
