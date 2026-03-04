"""Centralized logging configuration.

In production (debug=False), outputs structured JSON logs parseable by
CloudWatch, Datadog, ELK, etc. In development, uses human-readable format.
"""

import logging
import sys


def setup_logging(debug: bool = False) -> None:
    """Configure root logger for the application."""
    handler = logging.StreamHandler(sys.stdout)

    if debug:
        fmt = "%(asctime)s %(levelname)-8s %(name)s  %(message)s"
        handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
        level = logging.DEBUG
    else:
        # Structured JSON for production — one JSON object per line
        try:
            from pythonjsonlogger import jsonlogger

            formatter = jsonlogger.JsonFormatter(
                "%(asctime)s %(name)s %(levelname)s %(message)s",
                rename_fields={
                    "asctime": "timestamp",
                    "levelname": "level",
                    "name": "logger",
                },
            )
        except ImportError:
            # Fallback if python-json-logger not installed
            formatter = logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s"
            )
        handler.setFormatter(formatter)
        level = logging.INFO

    # Attach request ID filter so all log records include request_id
    from app.middleware.request_id import RequestIdLogFilter
    handler.addFilter(RequestIdLogFilter())

    # Reset root logger
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if debug else logging.WARNING
    )
