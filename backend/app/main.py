"""
Application server tunggal: menyajikan frontend VaeltrixAI (index.html, css/,
js/, assets/, fonts/, manifest.json, sw.js) DAN backend API (/api/v1/...) dari
satu origin yang sama (section 5 master prompt) -- frontend tidak butuh
konfigurasi base URL khusus untuk production, karena `VAELTRIX_BACKEND_BASE`
di 01-config.js memang sudah default ke string kosong (relatif ke origin sendiri).
"""
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.core.errors import AppError, app_error_handler, unhandled_error_handler
from app.core.logging import request_id_var, setup_logging

# backend/app/main.py -> backend/app -> backend -> VaeltrixAI/ (root project, tempat
# index.html, css/, js/, dst berada).
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Section 28: tiap request dapet ID unik buat korelasi log. Pakai
    X-Request-ID dari client kalau ada (mis. dari reverse proxy), bikin baru
    kalau enggak."""

    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        token = request_id_var.set(req_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = req_id
        return response


MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024  # 2MB -- cukup lega buat pesan chat/import panjang


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Section 25 (oversized requests). CATATAN JUJUR: ini cuma ngecek header
    Content-Length -- klien yang sengaja jahat & pakai chunked transfer
    encoding tanpa Content-Length bisa lewat cek ini. Tetap berguna buat
    mayoritas kasus (klien normal & percobaan spam biasa selalu ngirim
    Content-Length), tapi bukan jaminan mutlak."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > MAX_REQUEST_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"success": False, "error": {"code": "VALIDATION_ERROR", "message": "Request Terlalu Besar."}},
            )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Section 58 fix -- SEBELUMNYA gak ada header keamanan apa pun.

    CATATAN JUJUR: sengaja TIDAK nambahin Content-Security-Policy di sini.
    Frontend app ini pakai `onclick="..."` inline di HAMPIR SEMUA tombol
    (ratusan titik di index.html) -- CSP yang benar butuh `script-src` tanpa
    `unsafe-inline`, yang bakal MEMATIKAN hampir semua interaksi app ini kalau
    dipasang asal tanpa audit ulang total ke arsitektur inline-handler-nya
    (di luar scope sesi ini, dan gak bisa diverifikasi jalan tanpa browser
    beneran, yang gak ada di sandbox ini). Pasang CSP yang benar duluan REVISI
    arsitektur eventnya (pindah ke addEventListener + nonce/hash), bukan
    ditambal di middleware doang.

    4 header di bawah ini gak punya konflik semacam itu -- aman ditambah
    sekarang. HSTS cuma dikirim kalau APP_ENV=production (kalau device masih
    akses lewat http:// biasa pas development, HSTS bisa bikin browser
    "ngunci" ke https:// yang belum tentu ada, sampai max-age abis)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), geolocation=(), payment=()"
        if get_settings().app_env == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


def create_app() -> FastAPI:
    setup_logging()

    app = FastAPI(title="VaeltrixAI", version="1.8.0")

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(MaxBodySizeMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(api_router, prefix="/api/v1")

    for folder in ("css", "js", "assets", "fonts"):
        folder_path = FRONTEND_DIR / folder
        if folder_path.is_dir():
            app.mount(f"/{folder}", StaticFiles(directory=str(folder_path)), name=folder)

    @app.get("/manifest.json", include_in_schema=False)
    async def manifest():
        return FileResponse(FRONTEND_DIR / "manifest.json")

    @app.get("/sw.js", include_in_schema=False)
    async def service_worker():
        # Harus disajikan dari root ("/sw.js"), bukan "/js/sw.js" -- scope service
        # worker ditentukan dari path tempat file itu di-serve, bukan lokasi fisiknya.
        return FileResponse(FRONTEND_DIR / "sw.js", media_type="application/javascript")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            # Endpoint API yang gak ke-match router manapun -- WAJIB 404 JSON,
            # jangan sampai malah ke-serve index.html (bakal nyamarin bug jadi
            # "sukses" di frontend).
            raise AppError("NOT_FOUND", "Endpoint Tidak Ditemukan.", status_code=404)
        return FileResponse(FRONTEND_DIR / "index.html")

    return app


app = create_app()
