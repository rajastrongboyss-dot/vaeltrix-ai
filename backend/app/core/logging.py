"""
Structured logging (section 28 master prompt) -- 1 baris JSON per log entry,
gampang di-ingest log aggregator apa pun. request_id_var dipasang oleh
RequestIdMiddleware (main.py) supaya semua log dalam satu request yang sama
bisa dikorelasikan.

ATURAN KERAS -- JANGAN PERNAH log: password, JWT/access token, API key/secret
apa pun, ATAU isi pesan chat user (privasi). Kalau butuh nunjuk pesan user di
log, log PANJANGNYA doang, bukan isinya.
"""
import json
import logging
import sys
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Uvicorn punya logger sendiri (uvicorn.access/uvicorn.error) -- disamain
    # formatnya juga biar log satu aplikasi ini konsisten 1 format semua.
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = [handler]
        uv_logger.propagate = False


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
