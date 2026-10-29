# Kaiten Board

Архив заказов Kaiten и основа будущей веб-доски. Сервер — Python/FastAPI,
клиент — React + TypeScript + SCSS, сборка Vite; хранение — архив JSON или SQL-база.
Существующие карточки и вложения открываются через один интерфейс в обоих режимах.

## Запуск через Docker Compose

При запущенном Docker Desktop из корня проекта:

```powershell
python scripts/setup_docker.py
docker compose up --build -d
```

Откройте [http://127.0.0.1:8766](http://127.0.0.1:8766).

Для изменения клиентского кода с автоматическим обновлением:

```powershell
docker compose --profile dev up -d frontend-dev
```

Откройте [http://127.0.0.1:5173](http://127.0.0.1:5173).
Порт `8766` показывает готовую сборку из Docker-образа. Изменения исходников
на нём появляются после `docker compose build web` и
`docker compose up -d --no-deps web`.
Compose запускает PostgreSQL, миграции и приложение. Главная страница показывает
рабочую доску из БД: колонки, подколонки, дорожки и активные карточки с тегами
и обложками. Карточки загружаются порциями. Прежний просмотрщик доступен в `/archive`.
Сборка React-клиента и миграции выполняются автоматически; импорт и синхронизация
при запуске сайта не выполняются. Рабочие таблицы наполняются через `update_database.py`.

Подробности, экспорт из Kaiten и обслуживание — [docs/DOCKER.md](docs/DOCKER.md).
Рабочая модель БД — [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md).
Разработка React-клиента — [docs/FRONTEND.md](docs/FRONTEND.md).
FSD-архитектура и организация клиентского API — [docs/FRONTEND_ARCHITECTURE.md](docs/FRONTEND_ARCHITECTURE.md).
Главная страница и API структуры доски — [docs/BOARD.md](docs/BOARD.md).
Модальное окно рабочей карточки — [docs/CARD_DETAILS.md](docs/CARD_DETAILS.md).
Проект обновлений локальной доски через WebSocket — [docs/REALTIME.md](docs/REALTIME.md).
Обновление рабочих таблиц из существующих JSON — [docs/UPDATE_DATABASE.md](docs/UPDATE_DATABASE.md).

## Быстрый запуск без Docker на Windows

Из папки проекта:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.lock
npm --prefix frontend ci
npm --prefix frontend run build
.\.venv\Scripts\python.exe -m backend.app.cli migrate
.\.venv\Scripts\python.exe viewer.py
```

Откройте [http://127.0.0.1:8765](http://127.0.0.1:8765).
Остановка — Ctrl+C. Если `.venv` уже создано, первую команду повторять не нужно.
Активировать окружение отдельной командой не обязательно.

Для обновления зависимостей вместо зафиксированного набора:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

API доски: `/api/v1/boards`, `/api/v1/boards/{uuid}/structure`.
API архива: `/api/v1/snapshots`, `/api/v1/cards`, `/api/v1/cards/{id}`.
Проверка сервера: `/api/v1/health`. OpenAPI-спецификация: `/api/v1/openapi.json`.
Старые `/api/...` пока поддерживаются для совместимости.

## Структура

```text
backend/
  app/
    api/                  HTTP-маршруты и схемы ответов
    application/          сценарии работы с карточками и импорта
    domain/               интерфейсы репозитория и хранилища файлов
    infrastructure/
      archive/            чтение существующих JSON-копий
      database/           SQLAlchemy, модели и SQL-репозиторий
    presentation/         единая модель карточки для клиента
    core/                 настройки приложения
    main.py               сборка приложения FastAPI
    cli.py                миграции и импорт
  migrations/             версии структуры БД (Alembic)
frontend/
  src/app/                маршруты, провайдеры и общие стили
  src/pages/              страницы доски и архива
  src/widgets/            доска, просмотр карточки
  src/entities/           API, схемы и модели доски и архива
  src/shared/             HTTP-клиент, общие компоненты и форматирование
  dist/                   результат сборки Vite (не хранится в Git)
kaiten_backup/            независимый экспортёр из Kaiten
kaiten_viewer/            совместимые импорты для прежних путей
tests/                    проверки экспортёра, API, хранения и миграций
docs/                     архитектура, обучение и инструкция экспортёра
viewer.py                 удобный локальный запуск сервера
backup.py                 запуск экспортёра
```

## Работа через БД

Главная страница всегда читает рабочие SQL-таблицы. Параметр `BOARD_STORAGE`
относится к просмотрщику `/archive`: по умолчанию он читает `backups/` напрямую.
Переключение архива на SQL — явное действие. Импорт не меняет исходный архив.

Первый запуск локально, SQLite:

```powershell
.\.venv\Scripts\python.exe -m backend.app.cli migrate

# Сначала можно проверить на одной карточке.
.\.venv\Scripts\python.exe -m backend.app.cli import-archive --snapshot "2026-10-22_08-58-24_447787Z_board_437516" --card-id 14796378

# Затем импортировать весь выбранный снимок.
.\.venv\Scripts\python.exe -m backend.app.cli import-archive --snapshot "2026-10-22_08-58-24_447787Z_board_437516"

$env:BOARD_STORAGE = "database"
.\.venv\Scripts\python.exe viewer.py
```

SQLite-файл создаётся в `.local/board.db` и исключён из Git. Импорт повторяемый:
сочетание «снимок + ID карточки» уникально, повторный запуск обновляет запись,
а не дублирует её. Транзакции выполняются пакетами по 100 карточек.
Некорректные исходные карточки отмечаются в результате импорта.

В БД сохраняются JSON-разделы, справочники и поля для поиска. Бинарные вложения
остаются в `backups/` и выдаются через отдельное хранилище файлов. Пока не
перемещайте/удаляйте архив после импорта: в нём находятся оригиналы вложений.
Файлы архива, `.env` и рабочие настройки не публикуются через API.

Для возврата к чтению папок:

```powershell
$env:BOARD_STORAGE = "archive"
.\.venv\Scripts\python.exe viewer.py
```

Целевая БД для многопользовательского приложения — PostgreSQL:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[postgres]"
# Задайте BOARD_DATABASE_URL в окружении средствами своей среды разработки.
# Формат: postgresql+psycopg://USER:PASSWORD@HOST:5432/DATABASE
.\.venv\Scripts\python.exe -m backend.app.cli migrate
```

Миграции, импорт и чтение проверены на PostgreSQL в Docker и на SQLite.
Пароль подключения не записывайте в Git.

## Настройки

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `BOARD_STORAGE` | `archive` | `archive` или `database` |
| `BOARD_BACKUP_ROOT` | `backups/` относительно проекта | Копии и оригиналы вложений |
| `BOARD_DATABASE_URL` | `.local/board.db`, SQLite | Подключение SQLAlchemy |
| `BOARD_DATABASE_PASSWORD_FILE` | не задана | Файл пароля; используется Compose secret |
| `BOARD_WEB_PORT` | `8766` в Compose | Порт веб-приложения в Docker |
| `BOARD_FRONTEND_ROOT` | `frontend/dist/` | Собранный клиент Vite |

Настройки сервера отделены от `config.toml` и `.env` экспортёра. Сервер не
использует API-токен Kaiten. Для разработки с автоперезапуском:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8765
```

Приложение показывает локальную доску и позволяет создавать карточки с названием,
колонкой и дорожкой в своей БД. Вход, роли и приглашения описаны в docs/USERS_AND_AUTH.md. Редактирование параметров,
разграничение прав и полноценная доска — следующий этап, не скрытые возможности
этой версии. Порядок развития описан в архитектуре.

## Проверки и документы

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pip check
```

- [Архитектура и выбор технологий](docs/ARCHITECTURE.md)
- [Пользователи, вход, роли и приглашения](docs/USERS_AND_AUTH.md)
- [Проверка JSON, собственные ID и происхождение данных](docs/DATA_AUDIT.md)
- [Конфиг страниц и параметры навигации](docs/ROUTING.md)
- [Будущие обновления из Kaiten: выбранный API-опрос и альтернативные вебхуки](docs/SYNCHRONIZATION.md)
- [С чего начать изучение Python в этом проекте](docs/LEARNING.md)
- [Просмотр карточек и данные вашей копии](VIEWER.md)
- [Экспорт из Kaiten: конфиг, флаги, продолжение](docs/BACKUP.md)

Экспортёр по-прежнему запускается `python backup.py ...` и не требует
зависимостей веб-приложения. Для обновления схемы создавайте новые миграции,
а не редактируйте уже применённую `0001_archive`.
