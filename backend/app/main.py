from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import FileResponse, JSONResponse
from starlette.staticfiles import StaticFiles
from backend.app.api.routes import router, assets
from backend.app.application.cards import CardService
from backend.app.core.settings import Settings
from backend.app.infrastructure.archive.repository import ArchiveRepository
from backend.app.api.boards import router as board_router, images as board_images
from backend.app.application.boards import BoardService


SECURITY_POLICY = ("default-src 'self'; script-src 'self'; style-src 'self'; "
                   "img-src 'self' data:; media-src 'self'; connect-src 'self'; "
                   "frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")


def create_app(settings=None, repository=None, attachments=None, board_repository=None):
    settings = settings or Settings.from_env()
    archive = ArchiveRepository(settings.backup_root)
    engine = None
    if repository is None:
        if settings.storage == 'database':
            from backend.app.infrastructure.database.connection import make_engine
            from backend.app.infrastructure.database.repository import SqlCardRepository
            engine = make_engine(settings.database_url)
            repository = SqlCardRepository(engine)
        else:
            repository = archive

    if board_repository is None:
        from backend.app.infrastructure.database.connection import make_engine
        from backend.app.infrastructure.database.board_repository import SqlBoardRepository
        if engine is None:
            engine = make_engine(settings.database_url)
        board_repository = SqlBoardRepository(engine)

    @asynccontextmanager
    async def lifespan(app):
        yield
        if engine is not None:
            engine.dispose()

    app = FastAPI(title='Kaiten Board API', version='0.2.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url='/api/v1/openapi.json')
    app.state.cards = CardService(repository, attachments or archive)
    app.state.boards = BoardService(board_repository, settings.backup_root, settings.upload_root)
    app.state.settings = settings
    from backend.app.application.auth import AuthService
    from backend.app.api.auth import router as auth_router
    from backend.app.api.auth_guard import guard
    app.state.auth = AuthService(getattr(board_repository, 'engine', engine))
    from backend.app.application.avatars import AvatarService
    from backend.app.api.avatars import router as avatar_router
    app.state.avatars = AvatarService(getattr(board_repository, 'engine', engine), settings.upload_root)
    app.middleware('http')(guard)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost'])

    @app.middleware('http')
    async def headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.update({'X-Content-Type-Options': 'nosniff',
                                 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
                                 'Content-Security-Policy': SECURITY_POLICY})
        return response

    @app.exception_handler(FileNotFoundError)
    async def not_found(request, error):
        return JSONResponse({'error': str(error)}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid_value(request, error):
        return JSONResponse({'error': str(error)}, status_code=400)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse({'error': 'Неверные параметры запроса'}, status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return JSONResponse({'error': error.detail}, status_code=error.status_code)

    @app.exception_handler(OSError)
    async def storage_error(request, error):
        return JSONResponse({'error': 'Не удалось прочитать файл на диске'}, status_code=500)

    from sqlalchemy.exc import SQLAlchemyError

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, error):
        return JSONResponse({'error': 'База данных недоступна. Проверьте подключение и миграции.'}, status_code=503)

    app.include_router(router, prefix='/api/v1')
    app.include_router(auth_router, prefix='/api/v1')
    app.include_router(avatar_router, prefix='/api/v1')
    app.include_router(board_router, prefix='/api/v1')
    app.include_router(board_images, prefix='/api/v1')
    app.include_router(router, prefix='/api', include_in_schema=False)
    app.include_router(assets)
    @app.get('/', include_in_schema=False)
    @app.get('/archive', include_in_schema=False)
    @app.get('/login', include_in_schema=False)
    @app.get('/activate', include_in_schema=False)
    @app.get('/users', include_in_schema=False)
    @app.get('/profile', include_in_schema=False)
    def frontend():
        path = settings.frontend_root / 'index.html'
        if not path.is_file():
            return JSONResponse({'error': 'Клиент не собран. Выполните npm ci и npm run build в frontend/.'}, status_code=503)
        return FileResponse(path)

    # Serve only the Vite output directory. Source files, config and archives
    # are deliberately outside this mount; /assets remains the attachment API.
    app.mount('/static', StaticFiles(directory=settings.frontend_root / 'static', check_dir=False), name='frontend-static')
    return app


app = create_app()
