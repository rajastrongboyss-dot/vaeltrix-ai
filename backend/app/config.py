"""
Konfigurasi aplikasi -- baca semua nilai dari environment variable (.env).
JANGAN taruh secret asli langsung di sini; lihat .env.example di root project
untuk daftar variable yang dibutuhkan.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Supabase (section 8 master prompt: publishable = dulu "anon key",
    # secret = dulu "service_role key") ---
    supabase_url: str
    supabase_publishable_key: str
    # Secret key belum dipakai endpoint manapun di fase ini -- semua akses data
    # lewat RLS + token milik user sendiri (lihat core/dependencies.py). Disiapkan
    # di sini untuk fase privileged-access nanti (section 10).
    supabase_secret_key: str | None = None

    # --- AI Provider (platform-owned, dipakai user yang login lewat backend --
    # jalur BYOK di frontend tetap pakai key milik user sendiri, gak lewat sini
    # sama sekali). Format: dipisah koma kalau lebih dari 1 (dicoba berurutan). ---
    gemini_api_keys: str = ""
    groq_api_keys: str = ""

    # --- Premium redeem code (section 17 fix -- lihat account_service.py) ---
    # Dipisah koma kalau lebih dari 1 kode. KOSONGKAN dulu (fitur otomatis
    # nonaktif) sampai kamu isi kode BARU di sini -- kode lama yang ada di
    # frontend v1.8.0 (PREMIUM_CODES, ter-obfuscate XOR) HARUS dianggap bocor/
    # publik, jangan dipakai lagi.
    premium_redeem_codes: str = ""

    # --- Stripe (section 17/24 billing) -- kosongin semua = endpoint billing
    # balikin error yang jelas, bukan crash. Price ID ambil dari Stripe
    # Dashboard > Product Catalog (masing-masing produk/harga recurring). ---
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id_premium: str = ""
    stripe_price_id_pro: str = ""

    # --- App ---
    app_env: str = "development"

    # --- Cookie refresh token ---
    # WAJIB True di production (HTTPS). Set False HANYA kalau backend dijalankan
    # lokal lewat http:// (bukan https://), supaya browser tetap mau kirim cookie-nya.
    cookie_secure: bool = True

    # --- Kuota pesan per tier (section 16/17) -- SEBELUMNYA hardcode
    # TIER_MESSAGE_LIMIT langsung di entitlement_service.py, gak bisa diubah
    # tanpa ubah kode+redeploy. Sekarang lewat sini. ---
    free_tier_message_limit: int = 20
    premium_tier_message_limit: int = 60
    chat_rate_limit_window_minutes: int = 60

    # --- Batas panjang input (section 19) -- SEBELUMNYA hardcode langsung di
    # tiap schema Pydantic. Ganti nilai default di sini kalau mau limit beda,
    # TANPA perlu sentuh app/schemas/*.py sama sekali. ---
    max_message_length: int = 8000
    max_system_prompt_length: int = 4000
    max_conversation_title_length: int = 200
    max_project_name_length: int = 200
    max_project_instructions_length: int = 8000
    max_imported_message_content_length: int = 20000
    max_imported_messages_count: int = 2000
    # Section 20 -- jumlah pesan history TERAKHIR yang dikirim ke model AI
    # sebagai context (bukan batas berapa banyak pesan boleh disimpan).
    chat_history_limit: int = 40

    # --- Login abuse protection (section 18) -- SEBELUMNYA angka-angka ini
    # jadi argumen literal langsung di api/v1/auth.py. ---
    login_max_attempts_per_ip: int = 20
    login_max_attempts_per_email: int = 8
    login_throttle_window_minutes: int = 15
    register_max_attempts_per_ip: int = 5
    register_throttle_window_minutes: int = 60
    forgot_password_max_attempts_per_ip: int = 10
    forgot_password_max_attempts_per_email: int = 3
    forgot_password_throttle_window_minutes: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
