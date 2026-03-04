"""Request ID middleware for end-to-end request tracing.

Generates a unique X-Request-ID for every request and makes it available
to all downstream logging via a ContextVar. The ID is also returned in
the response headers so frontend/clients can reference it in bug reports.
"""

import logging
import uuid
from contextvars import ContextVar
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# ContextVar accessible from anywhere in the same async request
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inject X-Request-ID into every request/response cycle."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Use client-provided ID (e.g. from API gateway) or generate one
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_var.set(request_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestIdLogFilter(logging.Filter):
    """Inject request_id into every log record automatically."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("")  # type: ignore[attr-defined]
        return True
