"""
Sync preferensi lintas device (section 14/15 master prompt) -- theme, bahasa,
persona, dst. Disimpan sebagai satu blob JSONB (profiles.settings), BUKAN satu
kolom per setting, biar nambah setting baru di frontend nanti gak perlu
migration database baru tiap kali. Semantik update = REPLACE penuh (bukan
merge) -- frontend selalu ngirim snapshot lengkap key yang di-whitelist di
sisi frontend (18-cloud-sync.js: SYNCABLE_SETTINGS_KEYS).

SENGAJA TIDAK termasuk di sini: API key BYOK (Gemini/Groq/OpenRouter/
Pollinations/Tavily/ElevenLabs milik user) -- itu tetap cuma di device,
backend ini gak pernah tau/nyimpen key-key itu sama sekali.
"""
from app.core.dependencies import CurrentUser


async def get_user_settings(user: CurrentUser) -> dict:
    rows = await user.db.select("profiles", {"select": "settings", "id": f"eq.{user.id}"})
    if not rows:
        return {}
    return rows[0].get("settings") or {}


async def update_settings(user: CurrentUser, settings: dict) -> dict:
    rows = await user.db.update("profiles", {"id": f"eq.{user.id}"}, {"settings": settings})
    if not rows:
        return {}
    return rows[0].get("settings") or {}
