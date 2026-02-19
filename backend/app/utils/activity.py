"""Lightweight helper for recording activity log entries.

Usage:
    await log_activity(
        db, user, action="created", entity_type="batch",
        entity_id=batch.id, entity_code=batch.batch_code,
        summary="Submitted GRN for Apples from Grower X",
    )

The row is added to the current session and committed with the
enclosing transaction — no extra flush is performed.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.public.user import User
from app.models.tenant.activity_log import ActivityLog


async def log_activity(
    db: AsyncSession,
    user: User,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    entity_code: str | None = None,
    summary: str | None = None,
    details: dict | None = None,
) -> None:
    """Append an activity log entry to the current DB session."""
    entry = ActivityLog(
        user_id=user.id,
        user_name=user.full_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_code=entity_code,
        summary=summary,
        details=details,
    )
    db.add(entry)
