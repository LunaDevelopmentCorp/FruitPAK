"""Packhouse scoping dependency for per-packhouse data isolation.

Determines which packhouse(s) the current request can access:
  - assigned_packhouses absent/null in JWT → admin, sees all → returns None
  - assigned_packhouses=["id1","id2"]      → scoped user → returns that list
  - X-Packhouse-Id header                  → narrows to a single packhouse
    (admin: picks one to focus on; scoped user: must be in their allowed set)
"""

from fastapi import Depends, Header, HTTPException, status

from app.auth.deps import get_current_user
from app.models.public.user import User


async def get_packhouse_scope(
    user: User = Depends(get_current_user),
    x_packhouse_id: str | None = Header(None, alias="X-Packhouse-Id"),
) -> list[str] | None:
    """Return the effective packhouse filter for the current request.

    Returns:
        None       → no filter (admin sees all)
        list[str]  → filter queries to these packhouse IDs
    """
    payload: dict = getattr(user, "_token_payload", {})
    assigned: list[str] | None = payload.get("assigned_packhouses")

    if assigned is None:
        # Admin user — no JWT restriction
        if x_packhouse_id:
            return [x_packhouse_id]
        return None  # see everything

    # Scoped user — must respect their assignment
    if x_packhouse_id:
        if x_packhouse_id not in assigned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this packhouse",
            )
        return [x_packhouse_id]

    return assigned
