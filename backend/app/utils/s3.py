"""Document storage utility.

Uses S3 when AWS_S3_BUCKET is configured, otherwise falls back to
local filesystem storage under /app/storage/documents/.
"""

import logging
import os
from functools import lru_cache
from pathlib import Path

from app.config import settings

log = logging.getLogger(__name__)

LOCAL_STORAGE_ROOT = Path("/app/storage/documents")


def _use_s3() -> bool:
    return bool(settings.aws_s3_bucket)


# ── S3 helpers ────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_s3_client():
    import boto3
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
    )


# ── Local helpers ─────────────────────────────────────────────

def _local_path(key: str) -> Path:
    p = LOCAL_STORAGE_ROOT / key
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


# ── Public API ────────────────────────────────────────────────

def upload_file(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Upload bytes to S3 or local storage."""
    if _use_s3():
        _get_s3_client().put_object(
            Bucket=settings.aws_s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        log.info("S3 upload: %s (%d bytes)", key, len(data))
    else:
        path = _local_path(key)
        path.write_bytes(data)
        log.info("Local upload: %s (%d bytes)", path, len(data))


def download_file(key: str) -> bytes:
    """Download bytes from S3 or local storage."""
    if _use_s3():
        from botocore.exceptions import ClientError
        try:
            resp = _get_s3_client().get_object(Bucket=settings.aws_s3_bucket, Key=key)
            return resp["Body"].read()
        except ClientError as e:
            log.error("S3 download failed: %s — %s", key, e)
            raise
    else:
        path = _local_path(key)
        if not path.exists():
            raise FileNotFoundError(f"Local file not found: {path}")
        return path.read_bytes()


def delete_file(key: str) -> None:
    """Delete a file from S3 or local storage."""
    if _use_s3():
        from botocore.exceptions import ClientError
        try:
            _get_s3_client().delete_object(Bucket=settings.aws_s3_bucket, Key=key)
            log.info("S3 delete: %s", key)
        except ClientError as e:
            log.error("S3 delete failed: %s — %s", key, e)
            raise
    else:
        path = _local_path(key)
        if path.exists():
            path.unlink()
            log.info("Local delete: %s", path)


def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a download URL. S3 presigned URL or local serve path."""
    if _use_s3():
        return _get_s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.aws_s3_bucket, "Key": key},
            ExpiresIn=expires_in,
        )
    else:
        # Return a relative API path that the download endpoint will serve
        return f"/api/storage/{key}"
