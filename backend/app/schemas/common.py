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
