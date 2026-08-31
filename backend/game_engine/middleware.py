"""
HTTP 500 response-body logger middleware — E2E/debug only.

Django's loggers never record the HTTP response body; this middleware
logs response.content for every 500 so the raw body is captured in the
backend log for post-mortem investigation.

Scoped to settings_e2e only via MIDDLEWARE addition there. Not installed
in production or test settings.
"""

import logging

logger = logging.getLogger("http_500")


class ResponseBodyLoggerMiddleware:
    """Log the raw response body for every HTTP 500."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code >= 500:
            body = b""
            try:
                body = response.content
            except Exception:
                pass
            try:
                body_text = body.decode("utf-8", "replace")
            except Exception:
                body_text = repr(body)
            logger.error(
                "HTTP %s %s %s -> %s\nBODY:\n%s",
                request.method,
                request.get_full_path(),
                getattr(request, "content_type", ""),
                response.status_code,
                body_text[:20000],
                extra={
                    "request_path": request.path,
                    "request_method": request.method,
                    "request_id": request.headers.get("X-Request-Id", ""),
                },
            )
        return response
