"""
AppError terpusat + exception handler yang SELALU balikin bentuk
{"success": false, "error": {"code": ..., "message": ...}} -- kontrak yang
sudah diasumsikan frontend (lihat vxAuthFetch/vaeltrixApiFetch di
17-account.js: `json?.error?.message`).

Kategori "code" mengikuti section 27 master prompt: AUTHENTICATION_ERROR,
AUTHORIZATION_ERROR, VALIDATION_ERROR, RATE_LIMIT_ERROR, PROVIDER_ERROR,
NOT_FOUND, CONFLICT, INTERNAL_ERROR (+ beberapa kode spesifik lain seperti
EMAIL_CONFIRMATION_REQUIRED bila memang perlu dibedakan frontend nantinya).
"""
from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger("app.errors")


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.message}},
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Section 27: JANGAN kirim stack trace/detail internal ke user -- TAPI tetap
    # WAJIB kecatat di server (section 28), atau bug produksi gak ninggalin jejak
    # sama sekali. exc_info aman di-log (isinya trace kode, bukan data user).
    logger.error("Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "Terjadi Kesalahan Di Server."}},
    )
