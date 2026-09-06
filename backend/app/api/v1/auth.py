"""
Auth endpoints -- kontrak PERSIS yang sudah diasumsikan frontend di
17-account.js (vxAuthFetch): POST /register, /login, /refresh, /logout, semua
di bawah prefix /api/v1/auth, semua POST, semua pakai `credentials:"include"`.

Refresh token disimpan di cookie httpOnly (TIDAK pernah dibalikin di body) --
access token dibalikin di body dan cuma disimpan frontend di memory JS (lihat
komentar di 17-account.js soal ini, alasan XSS resistance).
"""
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Request, Response
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.core.errors import AppError
from app.core.responses import ok
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    OAuthCallbackRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "vx_refresh_token"
# Discope ke /api/v1/auth aja -- browser gak perlu kirim cookie ini ke endpoint
# lain (conversations, projects, dst) yang toh makenya Bearer token, bukan cookie.
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 hari


def _client_ip(request: Request) -> str:
    # Kalau di belakang reverse proxy/load balancer, X-Forwarded-For diisi
    # proxy-nya -- ambil entri PALING KIRI (client asli, bukan proxy). Kalau
    # header ini gak ada (dev lokal/akses langsung), pakai request.client.host.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
        max_age=REFRESH_COOKIE_MAX_AGE,
    )


@router.post("/register", status_code=201)
async def register(payload: RegisterRequest, request: Request, response: Response):
    # Section 18: batasi spam registrasi per-IP (per-email gak relevan di sini,
    # toh tiap percobaan pasti email BEDA-beda kalau niatnya spam akun).
    settings = get_settings()
    await auth_service.enforce_auth_throttle(
        _client_ip(request), "register", settings.register_max_attempts_per_ip, settings.register_throttle_window_minutes
    )
    result = await auth_service.register(payload.email, payload.password, payload.name)
    _set_refresh_cookie(response, result["refresh_token"])
    return ok({"accessToken": result["access_token"], "user": result["user"]})


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    # Section 18: throttle DUA arah -- per-IP (lebih longgar, bisa mewakili
    # banyak user asli di belakang NAT/proxy) DAN per-email (lebih ketat, satu
    # email dihajar berkali-kali jauh lebih mencurigakan daripada satu IP sibuk).
    settings = get_settings()
    await auth_service.enforce_auth_throttle(
        _client_ip(request), "login", settings.login_max_attempts_per_ip, settings.login_throttle_window_minutes
    )
    await auth_service.enforce_auth_throttle(
        payload.email.lower(), "login", settings.login_max_attempts_per_email, settings.login_throttle_window_minutes
    )
    result = await auth_service.login(payload.email, payload.password)
    _set_refresh_cookie(response, result["refresh_token"])
    return ok({"accessToken": result["access_token"], "user": result["user"]})


@router.post("/refresh")
async def refresh(response: Response, vx_refresh_token: str | None = Cookie(default=None)):
    result = await auth_service.refresh(vx_refresh_token)
    _set_refresh_cookie(response, result["refresh_token"])
    return ok({"accessToken": result["access_token"], "user": result["user"]})


@router.post("/logout")
async def logout(response: Response, vx_refresh_token: str | None = Cookie(default=None)):
    # vxAuthFetch("/logout") TIDAK mengirim Authorization header -- lihat
    # catatan di auth_service.logout soal kenapa cukup pakai refresh token cookie.
    await auth_service.logout(vx_refresh_token)
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return ok(None)


@router.post("/resend-verification")
async def resend_verification(payload: ResendVerificationRequest):
    # Sengaja SELALU balikin sukses generik -- gak bilang "email gak ketemu"
    # (hindari user enumeration, section 25).
    await auth_service.resend_verification(payload.email)
    return ok(None)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    # Section 18: throttle juga -- endpoint ini SELALU balikin sukses generik
    # (di bawah), jadi threshold-nya justru yang jadi satu-satunya rem buat
    # nyegah orang spam kirim email reset ke satu alamat/dari satu IP.
    settings = get_settings()
    await auth_service.enforce_auth_throttle(
        _client_ip(request),
        "forgot_password",
        settings.forgot_password_max_attempts_per_ip,
        settings.forgot_password_throttle_window_minutes,
    )
    await auth_service.enforce_auth_throttle(
        payload.email.lower(),
        "forgot_password",
        settings.forgot_password_max_attempts_per_email,
        settings.forgot_password_throttle_window_minutes,
    )
    # Sengaja SELALU balikin sukses generik juga di sini -- pola sama kayak
    # resend-verification di atas (hindari user enumeration, section 25).
    reset_url = f"{str(request.base_url).rstrip('/')}/reset-password"
    await auth_service.forgot_password(payload.email, reset_url)
    return ok(None)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    await auth_service.reset_password(payload.accessToken, payload.newPassword)
    return ok(None)


OAUTH_PROVIDERS = {"google", "github"}


@router.get("/oauth/{provider}", include_in_schema=False)
async def oauth_redirect(provider: str, request: Request):
    """Redirect browser ke Supabase Auth -- frontend TIDAK PERNAH perlu tau
    SUPABASE_URL sendiri (konsisten sama arsitektur same-origin, section 5).
    Provider Google/Github WAJIB dikonfigurasi & diaktifin dulu di Supabase
    Dashboard > Authentication > Providers -- kode ini gak bisa jalan kalau
    provider-nya belum diaktifin di sana."""
    if provider not in OAUTH_PROVIDERS:
        raise AppError("VALIDATION_ERROR", "Provider OAuth Gak Didukung.", status_code=400)
    settings = get_settings()
    callback_url = f"{str(request.base_url).rstrip('/')}/auth/callback"
    target = f"{settings.supabase_url}/auth/v1/authorize?provider={provider}&redirect_to={quote(callback_url, safe='')}"
    return RedirectResponse(target)


@router.post("/oauth-callback")
async def oauth_callback(payload: OAuthCallbackRequest, response: Response):
    # access_token/refresh_token di sini SUDAH diterbitkan Supabase sendiri lewat
    # redirect di atas -- frontend cuma nerusin apa yang ada di URL fragment
    # (lihat handleOAuthCallbackIfPresent, 17-account.js). Diverifikasi lagi di
    # auth_service.complete_oauth sebelum dipercaya.
    result = await auth_service.complete_oauth(payload.accessToken, payload.refreshToken)
    _set_refresh_cookie(response, result["refresh_token"])
    return ok({"accessToken": result["access_token"], "user": result["user"]})
