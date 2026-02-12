"""JWT token revocation using Redis blacklist.

Allows revoking tokens on logout, password change, or security events.
Tokens are blacklisted until their natural expiry.
"""

import time
from typing import Optional

from app.utils.cache import get_redis


class TokenRevocation:
    """Manage JWT token revocation with Redis."""

    @staticmethod
    async def revoke_token(token: str, expires_at: float) -> bool:
        """Add token to revocation list.

        Args:
            token: JWT token to revoke
            expires_at: Unix timestamp when token naturally expires

        Returns:
            True if successfully revoked
        """
        redis_client = await get_redis()

        # Calculate TTL (no need to store after natural expiry)
        ttl = int(expires_at - time.time())
        if ttl <= 0:
            # Token already expired, no need to blacklist
            return True

        try:
            # Store in Redis with TTL
            await redis_client.setex(
                f"revoked:{token}",
                ttl,
                str(int(time.time())),  # Revocation timestamp
            )
            return True
        except Exception as e:
            import logging
            logging.error(f"Failed to revoke token: {e}")
            return False

    @staticmethod
    async def is_revoked(token: str) -> bool:
        """Check if token is revoked.

        Args:
            token: JWT token to check

        Returns:
            True if token is revoked, False otherwise
        """
        redis_client = await get_redis()

        try:
            exists = await redis_client.exists(f"revoked:{token}")
            return exists > 0
        except Exception as e:
            import logging
            logging.error(f"Failed to check token revocation: {e}")
            # Fail closed for security
            return True

    @staticmethod
    async def revoke_all_user_tokens(user_id: str, duration: int = 86400) -> bool:
        """Revoke all tokens for a specific user.

        Useful for password changes, account compromise, etc.

        Args:
            user_id: User ID to revoke tokens for
            duration: How long to maintain the revocation (default: 24 hours)

        Returns:
            True if successfully revoked
        """
        redis_client = await get_redis()

        try:
            # Set a flag that all tokens for this user are revoked
            await redis_client.setex(
                f"revoked:user:{user_id}",
                duration,
                str(int(time.time())),
            )
            return True
        except Exception as e:
            import logging
            logging.error(f"Failed to revoke user tokens: {e}")
            return False

    @staticmethod
    async def is_user_revoked(user_id: str) -> bool:
        """Check if all tokens for a user are revoked.

        Args:
            user_id: User ID to check

        Returns:
            True if user's tokens are revoked
        """
        redis_client = await get_redis()

        try:
            exists = await redis_client.exists(f"revoked:user:{user_id}")
            return exists > 0
        except Exception as e:
            import logging
            logging.error(f"Failed to check user revocation: {e}")
            # Fail closed for security
            return True

    @staticmethod
    async def clear_revocation(token: str) -> bool:
        """Remove token from revocation list (rarely used).

        Args:
            token: JWT token to un-revoke

        Returns:
            True if successfully cleared
        """
        redis_client = await get_redis()

        try:
            await redis_client.delete(f"revoked:{token}")
            return True
        except Exception:
            return False

    @staticmethod
    async def get_revocation_count() -> int:
        """Get total number of revoked tokens (for monitoring).

        Returns:
            Number of revoked tokens in Redis
        """
        redis_client = await get_redis()

        try:
            count = 0
            async for _ in redis_client.scan_iter(match="revoked:*"):
                count += 1
            return count
        except Exception:
            return 0
