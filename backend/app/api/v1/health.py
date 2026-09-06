"""Health check -- section 29: bedain 'aplikasi hidup' vs 'dependency mati',
jangan selalu balikin 200 tanpa benar-benar mengecek."""
import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import get_settings

router = APIRouter()


@router.get("/health")
async def health():
    settings = get_settings()
    checks = {"app": "ok"}
    status = "ok"

    if not settings.supabase_url or not settings.supabase_publishable_key:
        checks["supabase"] = "not_configured"
        status = "degraded"
    else:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Panggilan paling ringan ke PostgREST -- cuma cek server hidup &
                # apikey valid, bukan query tabel manapun.
                res = await client.get(
                    f"{settings.supabase_url}/rest/v1/",
                    headers={"apikey": settings.supabase_publishable_key},
                )
            checks["supabase"] = "ok" if res.status_code < 500 else "unavailable"
            if res.status_code >= 500:
                status = "degraded"
        except httpx.HTTPError:
            checks["supabase"] = "unavailable"
            status = "degraded"

    # Section 27 fix: SEBELUMNYA health check gak pernah ngecek ini -- kalau
    # GEMINI_API_KEYS *dan* GROQ_API_KEYS dua-duanya kosong, chat 100% mati
    # buat semua user login (lihat _api_keys_for/chat_service.py), tapi health
    # check tetap balikin "ok" karena cuma ngecek Supabase. Sekarang ke-flag
    # juga sebagai degraded.
    if not settings.gemini_api_keys and not settings.groq_api_keys:
        checks["ai_providers"] = "not_configured"
        status = "degraded"
    else:
        checks["ai_providers"] = "ok"

    # HTTP status code SENGAJA ikut berubah (bukan cuma body-nya) -- load
    # balancer/orchestrator/Docker HEALTHCHECK biasanya cuma ngecek status
    # code, gak parse JSON body. 200 selalu = persis "health check yang gak
    # pernah beneran ngecek" yang dilarang section 29.
    return JSONResponse(
        status_code=200 if status == "ok" else 503,
        content={"success": True, "data": {"status": status, "checks": checks}},
    )
