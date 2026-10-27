FROM node:24-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY requirements-runtime.lock /tmp/requirements-runtime.lock
RUN pip install --no-cache-dir -r /tmp/requirements-runtime.lock \
    && groupadd --gid 10001 board \
    && useradd --uid 10001 --gid board --create-home board

COPY backend /app/backend
COPY --from=frontend-build /build/dist /app/frontend/dist
COPY kaiten_backup /app/kaiten_backup
COPY backup.py alembic.ini /app/
USER board
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
