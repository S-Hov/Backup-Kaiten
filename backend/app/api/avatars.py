from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from starlette.responses import FileResponse
from backend.app.application.avatars import MAX_AVATAR_BYTES
from .auth import identity

router = APIRouter(tags=['Avatars'])


class AvatarMode(BaseModel):
    mode: Literal['imported', 'initials']


@router.get('/users/{user_id}/avatar')
def avatar(user_id: UUID, request: Request, v: UUID | None = None):
    identity(request)
    return FileResponse(request.app.state.avatars.file(user_id, v), media_type='image/png')


@router.post('/auth/avatar')
async def upload(request: Request):
    user_id = identity(request)['userId']
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_AVATAR_BYTES:
            raise ValueError('Размер аватарки — не более 5 МБ')
        data.extend(chunk)
    return await run_in_threadpool(request.app.state.avatars.save, user_id, bytes(data))


@router.post('/auth/avatar/reset')
def reset(body: AvatarMode, request: Request):
    return request.app.state.avatars.reset(identity(request)['userId'], body.mode)
