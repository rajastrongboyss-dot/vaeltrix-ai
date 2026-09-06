"""
Business logic auth -- dipanggil dari router api/v1/auth.py. Tidak tahu
apa-apa soal Request/Response HTTP (itu urusan router); di sini cuma urusan
Supabase Auth REST + bentuk data yang dikembalikan ke frontend.
"""
from app.core.errors import AppError
from app.core.logging import get_logger
from app.integrations import supabase_client as sb
from app.integrations.supabase_client import PrivilegedRestClient, RestClient

logger = get_logger("app.auth")

# Section 18 fix: login/register/forgot-password sebelumnya gak ada proteksi
# brute-force/spam sama sekali. Dipanggil router (auth.py) DUA KALI per
# request -- sekali per IP, sekali per email -- dengan threshold yang beda
# (IP biasanya lebih longgar karena bisa mewakili banyak user asli di
# belakang NAT/proxy kantor; email lebih ketat karena satu email dihajar
# berkali-kali jauh lebih mencurigakan). Router yang nentuin identifier-nya
# (IP dari request, email dari body) -- modul ini sengaja gak tahu apa-apa
# soal HTTP/Request, konsisten sama aturan file ini di docstring atas.
async def enforce_auth_throttle(identifier: str, endpoint: str, max_attempts: int, window_minutes: int) -> None:
    privileged = PrivilegedRestClient()
    allowed = await privileged.rpc(
        "check_and_log_auth_attempt",
        {
            "p_identifier": identifier,
            "p_endpoint": endpoint,
            "p_max_attempts": max_attempts,
            "p_window_minutes": window_minutes,
        },
    )
    if not allowed:
        logger.warning("Auth throttle terpicu: endpoint=%s", endpoint)
        raise AppError(
            "RATE_LIMIT_ERROR", "Terlalu Banyak Percobaan. Coba Lagi Beberapa Menit Lagi.", status_code=429
        )


async def _to_safe_user(user: dict, access_token: str) -> dict:
    """Bentuk PERSIS yang diharapkan frontend (lihat 17-account.js: vxUser).
    Jangan pernah kirim field mentah dari Supabase tanpa whitelist eksplisit.

    "name" dibaca dari profiles.name (bisa diupdate lewat PATCH
    /account/profile -- lihat account_service.update_profile), BUKAN dari
    user_metadata Supabase Auth yang cuma keisi sekali pas signup dan gak ada
    jalur update-nya. Fallback ke user_metadata cuma buat kasus profiles.name
    masih kosong (mis. akun lama sebelum kolom ini kepake)."""
    meta = user.get("user_metadata") or {}
    db = RestClient(access_token)
    rows = await db.select("profiles", {"select": "tier,name", "id": f"eq.{user['id']}"})
    profile = rows[0] if rows else {}
    tier = profile.get("tier") or "free"
    name = profile.get("name") or meta.get("name")
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": name,
        "tier": tier,
    }


async def register(email: str, password: str, name: str | None) -> dict:
    try:
        body = await sb.sign_up(email, password, name)
    except sb.SupabaseAuthError as e:
        raise AppError("VALIDATION_ERROR", e.message, status_code=400) from e

    if "access_token" not in body:
        # Project Supabase-nya masih mewajibkan konfirmasi email -- akun SUDAH
        # dibuat di Supabase, tapi belum ada sesi buat langsung login. Kalau mau
        # register langsung login (perilaku yang diasumsikan frontend saat ini),
        # matikan "Confirm email" di Supabase Dashboard > Authentication > Providers > Email.
        raise AppError(
            "EMAIL_CONFIRMATION_REQUIRED",
            "Akun Dibuat. Cek Email Kamu Untuk Konfirmasi Sebelum Bisa Login.",
            status_code=400,
        )

    return {
        "access_token": body["access_token"],
        "refresh_token": body["refresh_token"],
        "user": await _to_safe_user(body["user"], body["access_token"]),
    }


async def login(email: str, password: str) -> dict:
    try:
        body = await sb.sign_in_with_password(email, password)
    except sb.SupabaseAuthError as e:
        logger.warning("Login gagal: email=%s status=%s", email, e.status_code)
        raise AppError("AUTHENTICATION_ERROR", e.message, status_code=401) from e

    return {
        "access_token": body["access_token"],
        "refresh_token": body["refresh_token"],
        "user": await _to_safe_user(body["user"], body["access_token"]),
    }


async def refresh(refresh_token: str | None) -> dict:
    if not refresh_token:
        raise AppError("AUTHENTICATION_ERROR", "Belum Login.", status_code=401)
    try:
        body = await sb.refresh_session(refresh_token)
    except sb.SupabaseAuthError as e:
        raise AppError("AUTHENTICATION_ERROR", e.message, status_code=401) from e

    return {
        "access_token": body["access_token"],
        "refresh_token": body["refresh_token"],
        "user": await _to_safe_user(body["user"], body["access_token"]),
    }


async def logout(refresh_token: str | None) -> None:
    """vxAuthFetch("/logout") TIDAK mengirim Authorization header -- yang ada
    cuma cookie refresh token (lihat 17-account.js). Jadi buat benar-benar
    revoke sesi di Supabase, tukar dulu refresh token itu jadi access token
    yang masih hidup, baru revoke. Kalau refresh token-nya sendiri sudah
    invalid/kosong, anggap saja sesi itu sudah tidak aktif -- tidak perlu
    dilempar sebagai error ke frontend (logout tetap harus terlihat berhasil)."""
    if not refresh_token:
        return
    try:
        body = await sb.refresh_session(refresh_token)
        await sb.sign_out(body["access_token"])
    except sb.SupabaseAuthError:
        pass


async def resend_verification(email: str) -> None:
    await sb.resend_confirmation(email)


async def forgot_password(email: str, redirect_to: str) -> None:
    await sb.recover_password(email, redirect_to)


async def reset_password(access_token: str, new_password: str) -> None:
    """access_token di sini hasil tukar token recovery dari link email (lihat
    vxAuthExtractHashToken di 17-account.js) -- WAJIB diverifikasi dulu sebelum
    dipercaya, sama kayak complete_oauth di bawah, supaya token yang sudah
    kadaluarsa/invalid gak nyampe ke update_user_password."""
    try:
        await sb.get_user(access_token)
    except sb.SupabaseAuthError as e:
        raise AppError(
            "AUTHENTICATION_ERROR", "Link Reset Password Sudah Kadaluarsa Atau Tidak Valid.", status_code=401
        ) from e
    await sb.update_user_password(access_token, new_password)


async def complete_oauth(access_token: str, refresh_token: str) -> dict:
    """Tokens ini udah diterbitkan Supabase sendiri (hasil redirect OAuth ke
    {SUPABASE_URL}/auth/v1/authorize) -- backend cuma perlu VERIFIKASI
    access_token itu beneran valid (bukan dikarang client), baru diperlakukan
    identik kayak login biasa (cookie refresh token, dst)."""
    try:
        user = await sb.get_user(access_token)
    except sb.SupabaseAuthError as e:
        raise AppError("AUTHENTICATION_ERROR", "Gagal Verifikasi Login OAuth.", status_code=401) from e

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": await _to_safe_user(user, access_token),
    }
