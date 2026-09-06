"""
Section 17 & 26 master prompt: entitlement (tier) DAN rate limit WAJIB
divalidasi server-side, gak boleh percaya field/counter client
(localStorage.premium, localStorage.vaeltrix_free_count -- keduanya gampang
dibohongin lewat devtools). Backend adalah satu-satunya source of truth.
"""
from app.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.integrations.supabase_client import RestClient

logger = get_logger("app.entitlement")

TIER_ORDER = ["free", "premium", "pro"]

# Berdasarkan gating `isPremium` yang SUDAH ADA di frontend (mode code/maxs/
# research, dipetakan MODE_TO_BACKEND_MODEL_ID ke "vaeltrix-max") -- BUKAN
# dikarang. flash/lite tetap gratis, sama seperti sekarang.
MODEL_MIN_TIER = {
    "vaeltrix-flash": "free",
    "vaeltrix-lite": "free",
    "vaeltrix-max": "premium",
}

# PERSIS FREE_LIMIT/PREMIUM_LIMIT di 01-config.js -- app cuma kenal 2 tingkat
# (isPremium true/false), jadi "pro" disamakan sama limit "premium".
# Section 26 fix: nilainya SEKARANG datang dari Settings/.env
# (FREE_TIER_MESSAGE_LIMIT dst, config.py) -- SEBELUMNYA hardcode langsung di
# sini, gak bisa diubah tanpa ubah kode+redeploy.
def _tier_message_limit(tier: str) -> int:
    settings = get_settings()
    limits = {
        "free": settings.free_tier_message_limit,
        "premium": settings.premium_tier_message_limit,
        "pro": settings.premium_tier_message_limit,
    }
    return limits.get(tier, settings.free_tier_message_limit)


async def get_tier(db: RestClient, user_id: str) -> str:
    rows = await db.select("profiles", {"select": "tier", "id": f"eq.{user_id}"})
    if not rows:
        return "free"
    return rows[0].get("tier") or "free"


def require_model_access(tier: str, model_id: str, user_id: str = "-") -> None:
    """Raise AppError kalau tier user kurang dari yang dibutuhkan model_id.
    user_id cuma dipakai buat konteks log (abuse detection, section 26) --
    opsional, biar test murni tier+model_id tetep bisa manggil ini tanpa perlu
    tau soal user_id/logging sama sekali."""
    min_tier = MODEL_MIN_TIER.get(model_id, "free")
    if min_tier == "free":
        return
    if TIER_ORDER.index(tier) < TIER_ORDER.index(min_tier):
        logger.warning("Model access denied: user_id=%s tier=%s model=%s", user_id, tier, model_id)
        raise AppError(
            "AUTHORIZATION_ERROR",
            "Model Ini Butuh Akun Premium. Upgrade Dulu Ya, Tuan.",
            status_code=403,
        )


async def check_rate_limit(db: RestClient, user_id: str, tier: str) -> None:
    """Section 17 fix: SEBELUMNYA count() baris messages lalu compare ke limit
    di sini (dua request DB terpisah) -- race kalau banyak request konkuren
    (lihat migration 0007 buat detail lengkap). Sekarang satu panggilan RPC ke
    Postgres function yang gabungin count+reservasi jadi satu transaksi atomik.
    Identitas user diambil dari auth.uid() DI DALAM function itu sendiri, bukan
    dari parameter yang dikirim -- gak bisa dipalsuin biar nge-hit limit user
    lain walau tau nama function-nya."""
    settings = get_settings()
    limit = _tier_message_limit(tier)
    allowed = await db.rpc(
        "check_and_reserve_rate_limit",
        {"p_limit": limit, "p_window_minutes": settings.chat_rate_limit_window_minutes},
    )
    if not allowed:
        logger.warning("Rate limit hit: user_id=%s tier=%s limit=%s", user_id, tier, limit)
        raise AppError(
            "RATE_LIMIT_ERROR",
            f"Sudah Pakai {limit} Pesan Dalam 1 Jam Terakhir. Coba Lagi Sebentar Lagi Ya.",
            status_code=429,
        )

