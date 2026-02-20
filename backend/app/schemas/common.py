"""Common schemas used across the application."""

from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper.

    Usage:
        response_model=PaginatedResponse[BatchSummary]

    Returns:
        {
            "items": [...],
            "total": 150,
            "limit": 50,
            "offset": 0
        }
    """
    items: list[T]
    total: int
    limit: int
    offset: int


class CursorPaginatedResponse(BaseModel, Generic[T]):
    """Cursor-based paginated response for large, time-ordered collections.

    Uses `created_at` of the last item as the cursor for the next page.
    Constant-time performance regardless of page depth (no OFFSET scan).
    """
    items: list[T]
    total: int
    limit: int
    next_cursor: str | None = None
    has_more: bool
