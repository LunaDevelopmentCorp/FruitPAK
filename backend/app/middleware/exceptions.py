"""Custom exception handlers for consistent error responses.

Provides standardized error formatting, security-safe error messages,
and proper logging for debugging.
"""

import logging
import traceback
from typing import Union

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class FruitPAKException(Exception):
    """Base exception for FruitPAK application errors."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str = "INTERNAL_ERROR",
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(self.message)


class BusinessLogicError(FruitPAKException):
    """Exception for business logic violations."""

    def __init__(self, message: str, error_code: str = "BUSINESS_LOGIC_ERROR"):
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=error_code,
        )


class ResourceNotFoundError(FruitPAKException):
    """Exception for resources not found."""

    def __init__(self, resource: str, identifier: str):
        super().__init__(
            message=f"{resource} not found: {identifier}",
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="RESOURCE_NOT_FOUND",
        )


class PermissionDeniedError(FruitPAKException):
    """Exception for permission denied."""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="PERMISSION_DENIED",
        )


class TenantContextError(FruitPAKException):
    """Exception for tenant context errors."""

    def __init__(self, message: str = "Tenant context required"):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="TENANT_CONTEXT_REQUIRED",
        )


def create_error_response(
    status_code: int,
    message: str,
    error_code: str = "ERROR",
    details: Union[dict, list, None] = None,
) -> JSONResponse:
    """Create standardized error response.

    Format:
    {
        "error": {
            "code": "ERROR_CODE",
            "message": "Human-readable error message",
            "details": {...}  // Optional additional details
        }
    }
    """
    content = {
        "error": {
            "code": error_code,
            "message": message,
        }
    }

    if details:
        content["error"]["details"] = details

    return JSONResponse(
        status_code=status_code,
        content=content,
    )


async def fruitpak_exception_handler(
    request: Request,
    exc: FruitPAKException,
) -> JSONResponse:
    """Handle custom FruitPAK exceptions."""
    logger.warning(
        f"FruitPAK exception: {exc.error_code} - {exc.message}",
        extra={
            "error_code": exc.error_code,
            "path": request.url.path,
            "method": request.method,
        },
    )

    return create_error_response(
        status_code=exc.status_code,
        message=exc.message,
        error_code=exc.error_code,
    )


async def http_exception_handler(
    request: Request,
    exc: Union[HTTPException, StarletteHTTPException],
) -> JSONResponse:
    """Handle FastAPI HTTP exceptions."""
    # Log non-4xx errors
    if exc.status_code >= 500:
        logger.error(
            f"HTTP {exc.status_code}: {exc.detail}",
            extra={
                "path": request.url.path,
                "method": request.method,
            },
        )

    return create_error_response(
        status_code=exc.status_code,
        message=str(exc.detail),
        error_code=f"HTTP_{exc.status_code}",
    )


async def validation_exception_handler(
    request: Request,
    exc: Union[RequestValidationError, ValidationError],
) -> JSONResponse:
    """Handle Pydantic validation errors."""
    logger.warning(
        f"Validation error on {request.url.path}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "errors": exc.errors(),
        },
    )

    # Format validation errors for better readability
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        errors.append({
            "field": field,
            "message": error["msg"],
            "type": error["type"],
        })

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message="Validation error",
        error_code="VALIDATION_ERROR",
        details={"errors": errors},
    )


async def database_exception_handler(
    request: Request,
    exc: IntegrityError,
) -> JSONResponse:
    """Handle database integrity errors (unique violations, foreign key, etc.)."""
    logger.error(
        f"Database integrity error on {request.url.path}: {str(exc)}",
        extra={
            "path": request.url.path,
            "method": request.method,
        },
    )

    # Extract meaningful error message
    error_msg = str(exc.orig) if hasattr(exc, "orig") else str(exc)

    # Check for common integrity violations
    if "unique" in error_msg.lower():
        message = "A record with this value already exists"
        error_code = "DUPLICATE_RECORD"
    elif "foreign key" in error_msg.lower():
        message = "Referenced record does not exist"
        error_code = "FOREIGN_KEY_VIOLATION"
    elif "not null" in error_msg.lower():
        message = "Required field is missing"
        error_code = "NULL_VALUE_NOT_ALLOWED"
    else:
        message = "Database constraint violation"
        error_code = "INTEGRITY_ERROR"

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message=message,
        error_code=error_code,
    )


async def operational_exception_handler(
    request: Request,
    exc: OperationalError,
) -> JSONResponse:
    """Handle database operational errors (connection issues, etc.)."""
    logger.error(
        f"Database operational error on {request.url.path}: {str(exc)}",
        extra={
            "path": request.url.path,
            "method": request.method,
        },
    )

    return create_error_response(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        message="Database temporarily unavailable. Please try again.",
        error_code="DATABASE_UNAVAILABLE",
    )


async def general_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Handle all other unhandled exceptions."""
    # Log full traceback for debugging
    logger.error(
        f"Unhandled exception on {request.url.path}: {str(exc)}",
        extra={
            "path": request.url.path,
            "method": request.method,
            "traceback": traceback.format_exc(),
        },
        exc_info=True,
    )

    # Return generic error to client (don't expose internal details)
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message="An unexpected error occurred. Please try again later.",
        error_code="INTERNAL_SERVER_ERROR",
    )


def register_exception_handlers(app):
    """Register all custom exception handlers with FastAPI app."""
    app.add_exception_handler(FruitPAKException, fruitpak_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ValidationError, validation_exception_handler)
    app.add_exception_handler(IntegrityError, database_exception_handler)
    app.add_exception_handler(OperationalError, operational_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
