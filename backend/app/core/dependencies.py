"""
Dependency FastAPI: identitas user WAJIB berasal dari token yang diverifikasi
langsung ke Supabase (section 9 master prompt) -- tidak pernah percaya user_id
dari body/query yang dikirim client.
"""
from fastapi import Header

from app.core.errors import AppError
from app.integrations import supabase_client as sb


class CurrentUser:
    def __init__(self, id: str, email: str | None, access_token: str):
        self.id = id
        self.email = email
        self.access_token = access_token
        # RLS-scoped REST client -- SEMUA query DB untuk request ini wajib lewat
        # sini, supaya auth.uid() di Postgres selalu konsisten dengan identitas
        # yang baru saja diverifikasi di atas.
        self.db = sb.RestClient(access_token)


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("AUTHENTICATION_ERROR", "Belum Login.", status_code=401)

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise AppError("AUTHENTICATION_ERROR", "Belum Login.", status_code=401)

    try:
        user = await sb.get_user(token)
    except sb.SupabaseAuthError as e:
        raise AppError("AUTHENTICATION_ERROR", e.message, status_code=401) from e

    return CurrentUser(id=user["id"], email=user.get("email"), access_token=token)
