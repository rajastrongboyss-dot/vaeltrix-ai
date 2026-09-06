"""
Usage stats -- dipanggil account.js (fetchAndRenderPlanInfo) buat nampilin
"X Request · Y Token Terpakai" di modal akun. Section 26: "usage data harus
bisa dipakai buat quota, analytics".

CATATAN JUJUR soal totalTokens: PostgREST punya dukungan aggregate function
(mis. `tokens.sum()`) di versi yang lebih baru, tapi sintaksnya beda-beda
antar versi dan gak bisa saya pastikan tanpa akses live ke project Supabase
kamu. Jadi di sini SENGAJA dijumlahin manual di Python dari baris yang
di-fetch -- lebih lambat buat user super aktif (dibatasi 10.000 baris
terakhir), tapi gak gambling soal fitur PostgREST yang gak bisa saya
verifikasi. totalTokens BISA undercount kalau provider gak nyertain data
usage di responsnya (lihat providers/gemini.py & groq.py) -- itu jujur lebih
baik daripada nampilin angka karangan.
"""
from app.core.dependencies import CurrentUser

_TOKEN_ROWS_LIMIT = "10000"


async def get_usage(user: CurrentUser) -> dict:
    total_requests = await user.db.count("messages", {"user_id": f"eq.{user.id}", "role": "eq.user"})

    rows = await user.db.select(
        "messages",
        {
            "select": "tokens",
            "user_id": f"eq.{user.id}",
            "role": "eq.assistant",
            "tokens": "not.is.null",
            "limit": _TOKEN_ROWS_LIMIT,
        },
    )
    total_tokens = sum(r["tokens"] for r in rows if isinstance(r.get("tokens"), int))

    return {"totalTokens": total_tokens, "totalRequests": total_requests}
