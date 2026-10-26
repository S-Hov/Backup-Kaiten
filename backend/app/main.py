from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import FileResponse, JSONResponse
from backend.app.api.routes import router, assets
from backend.app.application.cards import CardService
from backend.app.core.settings import Settings
from backend.app.infrastructure.archive.repository import ArchiveRepository


SECURITY_POLICY = ("default-src 'self'; script-src 'self'; style-src 'self'; "
                   "img-src 'self' data:; media-src 'self'; connect-src 'self'; "
                   "frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")


def create_app(settings=None, repository=None, attachments=None):
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

    @asynccontextmanager
    async def lifespan(app):
        yield
        if engine is not None:
            engine.dispose()

    app = FastAPI(title='Kaiten Board API', version='0.2.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url='/api/v1/openapi.json')
    app.state.cards = CardService(repository, attachments or archive)
    app.state.settings = settings
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
    app.include_router(router, prefix='/api', include_in_schema=False)
    app.include_router(assets)
    names = {'/': 'index.html', '/app.js': 'app.js', '/api.js': 'api.js',
             '/card-component.js': 'card-component.js', '/rich-text.js': 'rich-text.js',
             '/styles.css': 'styles.css'}

    def static_handler(filename):
        def response():
            path = settings.frontend_root / filename
            if not path.is_file():
                raise FileNotFoundError('Файл клиентского приложения не найден')
            return FileResponse(path, media_type='text/javascript' if filename.endswith('.js') else None)
        return response

    for route, filename in names.items():
        app.add_api_route(route, static_handler(filename), include_in_schema=False)
    return app


app = create_app()
