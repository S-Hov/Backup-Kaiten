from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response, HTTPException
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix='/auth', tags=['Local authentication'])
Password = Annotated[str, Field(min_length=12, max_length=128)]


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=128)


class Activate(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    password: Password


class PasswordChange(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=128)
    newPassword: Password


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=200)


class Invitation(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    role: Literal['admin', 'member', 'viewer'] = 'member'


class Access(BaseModel):
    active: bool
    role: Literal['admin', 'member', 'viewer']
    revoke: bool = False


def identity(request: Request):
    value = getattr(request.state, 'identity', None)
    if value is None:
        raise HTTPException(401, 'Войдите в систему')
    return value


def admin(request: Request):
    value = identity(request)
    if value['role'] != 'admin':
        raise HTTPException(403, 'Нужны права администратора')
    return value


def clear_cookies(response):
    response.delete_cookie('board_session', path='/')
    response.delete_cookie('board_csrf', path='/')


@router.post('/login')
def login(body: Login, request: Request, response: Response):
    profile, token, csrf = request.app.state.auth.login(body.email, body.password, request.client.host if request.client else '', request.headers.get('user-agent', ''))
    response.set_cookie('board_session', token, max_age=12*3600, httponly=True, secure=request.app.state.settings.secure_cookies, samesite='strict', path='/')
    response.set_cookie('board_csrf', csrf, max_age=12*3600, httponly=False, secure=request.app.state.settings.secure_cookies, samesite='strict', path='/')
    return profile


@router.get('/me')
def me(request: Request):
    return identity(request)['profile']


@router.post('/profile')
def update_profile(body: ProfileUpdate, request: Request):
    return request.app.state.auth.update_profile(identity(request), body.name)


@router.post('/activate')
def activate(body: Activate, request: Request):
    return request.app.state.auth.activate(body.token, body.password, request.client.host if request.client else '')


@router.post('/logout')
def logout(request: Request, response: Response):
    request.app.state.auth.logout(identity(request))
    clear_cookies(response)
    return {'ok': True}


@router.post('/logout-all')
def logout_all(request: Request, response: Response):
    request.app.state.auth.logout(identity(request), all_sessions=True)
    clear_cookies(response)
    return {'ok': True}


@router.post('/password')
def password(body: PasswordChange, request: Request, response: Response):
    request.app.state.auth.change_password(identity(request), body.currentPassword, body.newPassword)
    clear_cookies(response)
    return {'ok': True}


@router.get('/sessions')
def sessions(request: Request):
    return request.app.state.auth.sessions(identity(request))


@router.get('/users')
def users(request: Request):
    admin(request)
    return request.app.state.auth.users()


@router.post('/invitations')
def invite(body: Invitation, request: Request):
    actor = admin(request)
    return request.app.state.auth.invite(body.email, body.role, actor['accountId'])


@router.post('/accounts/{account_id}/access')
def access(account_id: UUID, body: Access, request: Request):
    actor = admin(request)
    request.app.state.auth.set_access(actor['accountId'], account_id, body.active, body.role, body.revoke)
    return {'ok': True}
