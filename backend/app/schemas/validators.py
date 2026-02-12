"""Enhanced Pydantic validators for input validation.

Provides reusable validators for common patterns:
- Email validation
- Phone number validation
- URL validation
- SQL injection prevention
- XSS prevention
- String sanitization
"""

import re
from typing import Any

from pydantic import field_validator


# Regex patterns
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
PHONE_REGEX = re.compile(r"^\+?[1-9]\d{1,14}$")  # E.164 format
URL_REGEX = re.compile(
    r"^https?://"  # http:// or https://
    r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"  # domain
    r"localhost|"  # localhost
    r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"  # IP
    r"(?::\d+)?"  # optional port
    r"(?:/?|[/?]\S+)$",
    re.IGNORECASE,
)

# SQL injection patterns (blacklist approach - use with caution)
SQL_INJECTION_PATTERNS = [
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)",
    r"(--|;|\/\*|\*\/|xp_|sp_)",
    r"(\bOR\b\s+\d+\s*=\s*\d+)",
    r"(\bUNION\b.*\bSELECT\b)",
]

# XSS patterns
XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",
    r"javascript:",
    r"on\w+\s*=",
    r"<iframe",
]


def sanitize_string(value: str, max_length: int = 1000) -> str:
    """Sanitize string input.

    Args:
        value: Input string
        max_length: Maximum allowed length

    Returns:
        Sanitized string

    Raises:
        ValueError: If validation fails
    """
    if not isinstance(value, str):
        raise ValueError("Must be a string")

    # Trim whitespace
    value = value.strip()

    # Check length
    if len(value) > max_length:
        raise ValueError(f"String too long (max {max_length} characters)")

    # Check for SQL injection patterns (basic check)
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Invalid characters detected")

    # Check for XSS patterns
    for pattern in XSS_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Invalid characters detected")

    return value


def validate_email(value: str) -> str:
    """Validate email address.

    Args:
        value: Email address

    Returns:
        Lowercase email address

    Raises:
        ValueError: If email is invalid
    """
    if not value:
        raise ValueError("Email is required")

    value = value.strip().lower()

    if len(value) > 254:  # RFC 5321
        raise ValueError("Email address too long")

    if not EMAIL_REGEX.match(value):
        raise ValueError("Invalid email address format")

    return value


def validate_phone(value: str) -> str:
    """Validate phone number (E.164 format).

    Args:
        value: Phone number

    Returns:
        Validated phone number

    Raises:
        ValueError: If phone number is invalid
    """
    if not value:
        raise ValueError("Phone number is required")

    # Remove spaces and dashes
    value = value.replace(" ", "").replace("-", "")

    if not PHONE_REGEX.match(value):
        raise ValueError(
            "Invalid phone number format (use E.164: +1234567890)"
        )

    return value


def validate_url(value: str) -> str:
    """Validate URL.

    Args:
        value: URL

    Returns:
        Validated URL

    Raises:
        ValueError: If URL is invalid
    """
    if not value:
        raise ValueError("URL is required")

    value = value.strip()

    if not URL_REGEX.match(value):
        raise ValueError("Invalid URL format")

    # Ensure HTTPS in production
    # (This check would be configurable based on environment)
    if not value.startswith("https://") and not value.startswith("http://localhost"):
        raise ValueError("URL must use HTTPS")

    return value


def validate_no_sql_injection(value: str) -> str:
    """Check for SQL injection patterns.

    Args:
        value: Input string

    Returns:
        Input string if safe

    Raises:
        ValueError: If SQL injection detected
    """
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Invalid input detected")

    return value


def validate_no_xss(value: str) -> str:
    """Check for XSS patterns.

    Args:
        value: Input string

    Returns:
        Input string if safe

    Raises:
        ValueError: If XSS detected
    """
    for pattern in XSS_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            raise ValueError("Invalid input detected")

    return value


def validate_alphanumeric(value: str, allow_spaces: bool = False) -> str:
    """Validate alphanumeric string.

    Args:
        value: Input string
        allow_spaces: Whether to allow spaces

    Returns:
        Validated string

    Raises:
        ValueError: If contains non-alphanumeric characters
    """
    if not value:
        raise ValueError("Value is required")

    value = value.strip()

    if allow_spaces:
        pattern = r"^[a-zA-Z0-9\s]+$"
    else:
        pattern = r"^[a-zA-Z0-9]+$"

    if not re.match(pattern, value):
        raise ValueError("Only alphanumeric characters allowed")

    return value


# Example usage in Pydantic models:
#
# from pydantic import BaseModel, field_validator
# from app.schemas.validators import validate_email, sanitize_string
#
# class UserCreate(BaseModel):
#     email: str
#     name: str
#
#     @field_validator("email")
#     @classmethod
#     def validate_email_field(cls, v: str) -> str:
#         return validate_email(v)
#
#     @field_validator("name")
#     @classmethod
#     def validate_name_field(cls, v: str) -> str:
#         return sanitize_string(v, max_length=100)
