import hmac
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.concurrency import run_in_threadpool
from sqlalchemy.exc import SQLAlchemyError
from backend.app.core.passwords import token_hash

PUBLIC = {'/api/v1/auth/login', '/api/v1/auth/activate', '/api/v1/health', '/api/v1/ready', '/api/health', '/api/ready'}


async def guard(request, call_next):
    settings = request.app.state.settings
    path = request.url.path
    private = path.startswith(('/api/', '/assets/')) and path not in PUBLIC
    request.state.identity = None
    if settings.auth_required:
        try:
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                origin = request.headers.get('origin')
                if origin and origin not in settings.allowed_origins:
                    raise HTTPException(403, 'Источник запроса не разрешён')
            if private:
                identity = await run_in_threadpool(request.app.state.auth.session, request.cookies.get('board_session'))
                request.state.identity = identity
                if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                    csrf = request.headers.get('x-csrf-token', '')
                    if not csrf or not hmac.compare_digest(token_hash(csrf), identity['csrfHash']):
                        raise HTTPException(403, 'Обновите страницу и повторите действие')
                    if identity['role'] == 'viewer' and not path.startswith('/api/v1/auth/'):
                        raise HTTPException(403, 'Доступ разрешён только для просмотра')
        except HTTPException as error:
            return JSONResponse({'error': error.detail}, status_code=error.status_code)
        except SQLAlchemyError:
            return JSONResponse({'error': 'База данных недоступна. Проверьте миграции.'}, status_code=503)
    return await call_next(request)
