FROM python:3.11-slim-bookworm

RUN adduser --disabled-password --gecos "" appuser

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && echo "installed $(pip show channels daphne | grep -i version | tr '\n' ' ')"

# Force the pinned channels version in a SEPARATE layer. Railway's BuildKit was
# reusing a cached `pip install -r requirements.txt` layer (channels==4.0.0) even
# after the requirements.txt pin changed, so prod kept crashing with the daphne
# handshake_deferred AttributeError. This explicit upgrade installs 4.1.0 in a
# fresh layer (new cache key) that cannot be served from the stale 4.0.0 cache.
RUN pip install --no-cache-dir --force-reinstall --upgrade "channels==4.1.0" && echo "channels forced: $(pip show channels | grep -i version)"

COPY backend/ .

# Logging uses RotatingFileHandler -> BASE_DIR/logs/django.log.
# The dir must exist (and be writable by appuser) or Django
# crashes at startup with "Unable to configure handler 'file'".
RUN mkdir -p /app/logs && chown -R appuser:appuser /app/logs

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT','8000') + '/health/')" || exit 1

# Shell form so $PORT expands (exec form does NOT expand shell vars).
CMD daphne -b 0.0.0.0 -p "${PORT:-8000}" sound_royale_api.asgi:application
