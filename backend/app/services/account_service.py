"""
Redeem kode premium -- section 17 fix. Validasi kode PINDAH ke server (env var
PREMIUM_REDEEM_CODES), TIDAK lagi dicek di JS browser (bisa dibaca siapa aja
lewat devtools/view-source, dan localStorage.vaeltrix_premium bisa diset
manual tanpa kode sama sekali). UX yang dilihat user tetap sama seperti
sekarang (masukkan kode di modal premium) -- cuma sekarang manggil endpoint
ini alih-alih ngecek array PREMIUM_CODES secara lokal.
"""
from app.config import get_settings
from app.core.dependencies import CurrentUser
from app.core.errors import AppError
from app.integrations import supabase_client as sb
from app.integrations.supabase_client import PrivilegedRestClient


def _valid_codes() -> set[str]:
    settings = get_settings()
    return {c.strip().upper() for c in settings.premium_redeem_codes.split(",") if c.strip()}


async def redeem_code(user: CurrentUser, code: str) -> str:
    codes = _valid_codes()
    if not codes:
        raise AppError("VALIDATION_ERROR", "Redeem Kode Belum Diaktifkan Di Server.", status_code=400)
    if code.strip().upper() not in codes:
        raise AppError("VALIDATION_ERROR", "Kode Salah Atau Sudah Kadaluarsa.", status_code=400)

    # Kolom "tier" sengaja di-REVOKE dari token user biasa (migration 0003) --
    # update ini WAJIB lewat privileged client, dan WAJIB discope pakai user.id
    # yang sudah diverifikasi get_current_user (BUKAN id dari body request).
    privileged = PrivilegedRestClient()
    rows = await privileged.update("profiles", {"id": f"eq.{user.id}"}, {"tier": "premium"})
    if not rows:
        raise AppError("INTERNAL_ERROR", "Gagal Mengaktifkan Premium.", status_code=500)
    return rows[0]["tier"]


async def change_password(user: CurrentUser, current_password: str, new_password: str) -> None:
    if not user.email:
        raise AppError("VALIDATION_ERROR", "Akun Ini Gak Punya Email Terdaftar.", status_code=400)
    # Verifikasi password LAMA dulu -- access token yang masih hidup sebenarnya
    # udah cukup buat GoTrue ngizinin ganti password, tapi UX yang diminta
    # (lihat referensi) minta konfirmasi password lama secara eksplisit.
    try:
        await sb.sign_in_with_password(user.email, current_password)
    except sb.SupabaseAuthError as e:
        raise AppError("AUTHENTICATION_ERROR", "Password Saat Ini Salah.", status_code=401) from e

    try:
        await sb.update_user_password(user.access_token, new_password)
    except sb.SupabaseAuthError as e:
        raise AppError("VALIDATION_ERROR", e.message, status_code=400) from e


async def delete_account(user: CurrentUser) -> None:
    # Section 24: hapus akun = hapus SEMUA data terkait, bukan cuma auth row.
    # Cascade FK (migration 0001: on delete cascade) otomatis nyapu profiles/
    # projects/conversations/messages -- gak ninggalin orphaned data.
    try:
        await sb.admin_delete_user(user.id)
    except sb.SupabaseAuthError as e:
        raise AppError("INTERNAL_ERROR", "Gagal Menghapus Akun.", status_code=500) from e


async def update_profile(user: CurrentUser, name: str) -> dict:
    # BEDA dari redeem_code/delete_account -- kolom "name" SENGAJA di-grant ke
    # role authenticated (migration 0003), jadi cukup lewat user.db biasa
    # (RLS-scoped token user sendiri), TIDAK butuh PrivilegedRestClient.
    name = name.strip()
    if not name:
        raise AppError("VALIDATION_ERROR", "Nama Gak Boleh Kosong.", status_code=422)
    rows = await user.db.update("profiles", {"id": f"eq.{user.id}"}, {"name": name})
    if not rows:
        raise AppError("INTERNAL_ERROR", "Gagal Update Profil.", status_code=500)
    return {"name": rows[0]["name"]}
