"""In-memory ring buffer for system health warnings.

Captures operational warnings (slow queries, Redis failures, rate limit
fallbacks) so they can be surfaced in the admin dashboard without requiring
log aggregation infrastructure.

Thread-safe via deque's atomic append. The buffer is per-process — in a
multi-worker deployment each worker tracks its own warnings.
"""

from collections import deque
from datetime import datetime, timezone

_MAX_WARNINGS = 100

_warnings: deque[dict] = deque(maxlen=_MAX_WARNINGS)


def add_warning(category: str, message: str, level: str = "warning") -> None:
    """Push a warning into the ring buffer.

    Args:
        category: One of "slow_query", "redis", "rate_limit", "cache"
        message: Human-readable description
        level: "warning" or "error"
    """
    _warnings.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "category": category,
        "message": message,
    })


def get_recent_warnings(limit: int = 50) -> list[dict]:
    """Return the most recent warnings (newest last)."""
    return list(_warnings)[-limit:]


def get_warning_counts() -> dict[str, int]:
    """Return warning counts by category."""
    counts: dict[str, int] = {}
    for w in _warnings:
        cat = w["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return counts
