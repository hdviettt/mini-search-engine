"""Logging setup.

The backend used to `print()` everywhere, which is invisible in Railway's log
viewer once you need levels, timestamps, or a stack trace. Call setup_logging()
once at process start; every module then uses logging.getLogger(__name__).
"""
import logging
import os
import sys

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

_FORMAT = "%(asctime)s %(levelname)-7s %(name)-24s %(message)s"
_DATE_FORMAT = "%H:%M:%S"


def setup_logging(level: str | None = None) -> None:
    """Configure root logging. Safe to call more than once."""
    root = logging.getLogger()
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATE_FORMAT))

    root.addHandler(handler)
    root.setLevel(level or LOG_LEVEL)

    # These are chatty at INFO and drown out our own lines.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
