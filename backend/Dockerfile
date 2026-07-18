FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY . /app

WORKDIR /app/backend

# whitenoise serves collected static files; collect at build time (failsafe if no static)
RUN DJANGO_SETTINGS_MODULE=sound_royale_api.settings \
    SECRET_KEY=build-only python manage.py collectstatic --noinput || true

EXPOSE 8000

# Daphne terminates both HTTP and WebSocket on a single port ($PORT from Railway)
CMD ["sh", "-c", "daphne -b 0.0.0.0 -p ${PORT:-8000} sound_royale_api.asgi:application"]
