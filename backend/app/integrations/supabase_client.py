"""
Wrapper tipis di atas REST API Supabase (Auth/GoTrue + PostgREST), pakai httpx.

KENAPA HTTPX LANGSUNG, BUKAN SDK `supabase-py`:
File ini ditulis tanpa akses internet live untuk mengecek versi/nama-method SDK
`supabase-py` yang bakal ter-install di environment kamu. REST API Supabase
sendiri (GoTrue untuk Auth, PostgREST untuk tabel) jauh lebih stabil dan
terdokumentasi publik dengan kontrak HTTP yang sama persis di semua versi, jadi
risiko salah jauh lebih kecil. Kalau nanti mau pindah ke SDK resmi, cukup ganti
isi file ini -- seluruh service layer di atasnya tidak perlu berubah.

POLA AUTH KE POSTGREST:
Setiap query tabel dilakukan ATAS NAMA satu user, dengan access token milik user
itu sendiri di header Authorization (BUKAN secret/service key) -- supaya RLS
(`auth.uid()`) di Postgres yang menentukan baris mana yang boleh diakses.
Backend tidak pernah "menyamar" jadi user dengan cara mempercayai user_id yang
dikirim client (section 9 & 10 master prompt).

CATATAN DESAIN: settings HANYA diakses lewat get_settings() di DALAM fungsi
(lazy), bukan sekali di level module -- supaya file ini (dan apa pun yang
nge-import-nya, termasuk core/dependencies.py) tetap bisa di-import buat
testing/tooling tanpa perlu SUPABASE_URL dkk sudah keisi beneran. Kalau
settings diambil di level module, sekadar `import` file ini aja udah bisa
crash duluan sebelum sempat masuk error handling FastAPI yang benar.
"""
import httpx

from app.config import get_settings

_TIMEOUT = 15.0


def _auth_base() -> str:
    return f"{get_settings().supabase_url}/auth/v1"


def _rest_base() -> str:
    return f"{get_settings().supabase_url}/rest/v1"


class SupabaseAuthError(Exception):
    """Auth REST Supabase menolak request (kredensial salah, token expired, dst)."""

    def __init__(self, message: str, status_code: int):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class SupabaseRestError(Exception):
    """PostgREST menolak request (RLS, validation, constraint, dst)."""

    def __init__(self, message: str, status_code: int):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _auth_headers() -> dict:
    return {"apikey": get_settings().supabase_publishable_key, "Content-Type": "application/json"}


def _extract_auth_error(res: httpx.Response) -> str:
    try:
        body = res.json()
    except Exception:
        return "Gagal Terhubung Ke Server Auth."
    return body.get("msg") or body.get("error_description") or body.get("error") or "Gagal Terhubung Ke Server Auth."


async def sign_up(email: str, password: str, name: str | None = None) -> dict:
    payload: dict = {"email": email, "password": password}
    if name:
        payload["data"] = {"name": name}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(f"{_auth_base()}/signup", headers=_auth_headers(), json=payload)
    if res.status_code >= 400:
        raise SupabaseAuthError(_extract_auth_error(res), res.status_code)
    return res.json() if res.content else {}


async def sign_in_with_password(email: str, password: str) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            f"{_auth_base()}/token",
            params={"grant_type": "password"},
            headers=_auth_headers(),
            json={"email": email, "password": password},
        )
    if res.status_code >= 400:
        raise SupabaseAuthError(_extract_auth_error(res), res.status_code)
    return res.json() if res.content else {}


async def refresh_session(refresh_token: str) -> dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            f"{_auth_base()}/token",
            params={"grant_type": "refresh_token"},
            headers=_auth_headers(),
            json={"refresh_token": refresh_token},
        )
    if res.status_code >= 400:
        raise SupabaseAuthError(_extract_auth_error(res), res.status_code)
    return res.json() if res.content else {}


async def sign_out(access_token: str) -> None:
    """Revoke sesi di Supabase. Kegagalan SENGAJA tidak dilempar sebagai
    exception -- pemanggil (auth_service.logout) selalu menganggap logout
    berhasil secara lokal apa pun hasil panggilan ini."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await client.post(
                f"{_auth_base()}/logout",
                headers={**_auth_headers(), "Authorization": f"Bearer {access_token}"},
            )
    except httpx.HTTPError:
        pass


async def get_user(access_token: str) -> dict:
    """Verifikasi access token ke Supabase, balikin objek user kalau valid."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(
            f"{_auth_base()}/user",
            headers={**_auth_headers(), "Authorization": f"Bearer {access_token}"},
        )
    if res.status_code >= 400:
        raise SupabaseAuthError("Sesi Tidak Valid Atau Sudah Berakhir.", res.status_code)
    return res.json()


async def resend_confirmation(email: str) -> None:
    """Kirim ulang email konfirmasi signup. Sengaja gak dilempar error kalau
    email gak ketemu -- samain respons ada/gaknya akun (hindari user
    enumeration), sama kayak logout: dianggap 'sukses' secara lokal."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            await client.post(
                f"{_auth_base()}/resend",
                headers=_auth_headers(),
                json={"type": "signup", "email": email},
            )
        except httpx.HTTPError:
            pass


async def recover_password(email: str, redirect_to: str) -> None:
    """Minta Supabase kirim email reset password (link isinya token recovery,
    ngarah ke redirect_to). Sengaja gak dilempar error kalau email gak ketemu --
    alasan sama persis kayak resend_confirmation di atas (hindari user
    enumeration). Password barunya sendiri disetel lewat update_user_password
    di bawah, pakai access_token hasil tukar token recovery itu."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            await client.post(
                f"{_auth_base()}/recover",
                headers=_auth_headers(),
                json={"email": email, "options": {"redirect_to": redirect_to}},
            )
        except httpx.HTTPError:
            pass


async def update_user_password(access_token: str, new_password: str) -> None:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.put(
            f"{_auth_base()}/user",
            headers={**_auth_headers(), "Authorization": f"Bearer {access_token}"},
            json={"password": new_password},
        )
    if res.status_code >= 400:
        raise SupabaseAuthError(_extract_auth_error(res), res.status_code)


async def admin_delete_user(user_id: str) -> None:
    """Hapus akun sepenuhnya -- WAJIB secret key (bukan operasi user biasa,
    gak ada di GoTrue API yang di-scope token user). Cascade ke profiles/
    projects/conversations/messages sudah ditangani FK `on delete cascade`
    (migration 0001), jadi gak ninggalin orphaned data (section 24)."""
    settings = get_settings()
    if not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_SECRET_KEY belum diisi -- wajib untuk hapus akun.")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.delete(
            f"{_auth_base()}/admin/users/{user_id}",
            headers={
                "apikey": settings.supabase_secret_key,
                "Authorization": f"Bearer {settings.supabase_secret_key}",
            },
        )
    if res.status_code >= 400 and res.status_code != 404:
        raise SupabaseAuthError(_extract_auth_error(res), res.status_code)


class RestClient:
    """Klien PostgREST yang selalu jalan ATAS NAMA satu user (RLS-scoped).
    Tidak ada method yang menerima/menggunakan secret key -- kalau nanti ada
    endpoint yang genuinely butuh privileged access, itu WAJIB jadi klien
    terpisah yang eksplisit, bukan menambah opsi diam-diam di sini."""

    def __init__(self, access_token: str):
        self._headers = {
            "apikey": get_settings().supabase_publishable_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def select(self, table: str, params: dict) -> list[dict]:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.get(f"{_rest_base()}/{table}", headers=self._headers, params=params)
        return self._parse_list(res)

    async def insert_one(self, table: str, data: dict) -> dict:
        headers = {**self._headers, "Prefer": "return=representation"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.post(f"{_rest_base()}/{table}", headers=headers, json=data)
        rows = self._parse_list(res)
        if not rows:
            raise SupabaseRestError("Gagal Membuat Data.", res.status_code)
        return rows[0]

    async def insert_many(self, table: str, data: list[dict]) -> list[dict]:
        headers = {**self._headers, "Prefer": "return=representation"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.post(f"{_rest_base()}/{table}", headers=headers, json=data)
        return self._parse_list(res)

    async def update(self, table: str, params: dict, data: dict) -> list[dict]:
        headers = {**self._headers, "Prefer": "return=representation"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.patch(f"{_rest_base()}/{table}", headers=headers, params=params, json=data)
        return self._parse_list(res)

    async def delete(self, table: str, params: dict) -> list[dict]:
        headers = {**self._headers, "Prefer": "return=representation"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.delete(f"{_rest_base()}/{table}", headers=headers, params=params)
        return self._parse_list(res)

    async def count(self, table: str, params: dict) -> int:
        """Jumlah baris yang match filter, TANPA transfer semua rownya --
        pakai fitur exact count PostgREST (header Content-Range: start-end/total)."""
        headers = {**self._headers, "Prefer": "count=exact"}
        query = {**params, "limit": "1"}
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.get(f"{_rest_base()}/{table}", headers=headers, params=query)
        if res.status_code >= 400:
            raise SupabaseRestError(self._error_message(res), res.status_code)
        content_range = res.headers.get("content-range", "")
        if "/" in content_range:
            total = content_range.rsplit("/", 1)[-1]
            if total.isdigit():
                return int(total)
        return 0

    async def rpc(self, function_name: str, params: dict | None = None):
        """Panggil Postgres function lewat PostgREST (POST /rpc/<nama>), TETAP
        pakai token user (RLS/auth.uid() context ikut kebawa) -- bukan lewat
        PrivilegedRestClient. Dipakai buat operasi yang butuh atomik di level
        database (mis. check_and_reserve_rate_limit, migration 0007) yang gak
        bisa dijamin cuma pakai select/insert/update/delete biasa terpisah."""
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            res = await client.post(f"{_rest_base()}/rpc/{function_name}", headers=self._headers, json=params or {})
        if res.status_code >= 400:
            raise SupabaseRestError(self._error_message(res), res.status_code)
        return res.json() if res.content else None

    @staticmethod
    def _parse_list(res: httpx.Response) -> list[dict]:
        if res.status_code >= 400:
            raise SupabaseRestError(RestClient._error_message(res), res.status_code)
        return res.json() if res.content else []

    @staticmethod
    def _error_message(res: httpx.Response) -> str:
        try:
            body = res.json()
            return body.get("message") or "Database Sedang Bermasalah."
        except Exception:
            return "Database Sedang Bermasalah."


class PrivilegedRestClient(RestClient):
    """Pakai SUPABASE_SECRET_KEY -- BYPASS RLS sepenuhnya. HANYA untuk operasi
    yang genuinely butuh privileged access (mis. account_service.redeem_code
    mengubah profiles.tier, kolom yang sengaja di-REVOKE dari role
    'authenticated' biasa lewat migration 0003). Setiap pemanggil WAJIB
    men-scope query-nya sendiri pakai id yang SUDAH diverifikasi
    (CurrentUser.id dari get_current_user) -- TIDAK PERNAH pakai id mentah
    dari body/query request client (section 10 master prompt)."""

    def __init__(self):
        secret = get_settings().supabase_secret_key
        if not secret:
            raise RuntimeError(
                "SUPABASE_SECRET_KEY belum diisi di .env -- wajib untuk operasi privileged."
            )
        self._headers = {
            "apikey": secret,
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        }
