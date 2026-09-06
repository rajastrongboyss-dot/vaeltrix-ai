"""
Integration test RLS lintas-user (section 49). BEDA KARAKTER dari semua test
lain di proyek ini (makanya ditaruh di subfolder terpisah, `tests/integration/`):
RLS ditegakkan Postgres sendiri, bukan kode Python -- gak ada cara jujur buat
"unit test" ini pakai mock. Wajib koneksi Supabase ASLI.

BELUM PERNAH DIEKSEKUSI SAMA SEKALI -- sandbox tempat file ini ditulis gak
punya akses internet maupun project Supabase buat dicoba. Anggap ini
SPESIFIKASI yang siap jalan begitu 2 env var di bawah diisi, BUKAN bukti
bahwa RLS-nya beneran kerja -- itu baru kebukti begitu kamu jalanin ini
beneran dan lolos.

Pakai project Supabase TEST terpisah, JANGAN production -- file ini bikin
user baru tiap kali jalan dan gak menghapusnya lagi.

    VAELTRIX_TEST_SUPABASE_URL=https://xxxxx.supabase.co \\
    VAELTRIX_TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx \\
    pytest tests/integration/ -v
"""
import asyncio
import os
import uuid

import httpx
import pytest

SUPABASE_URL = os.environ.get("VAELTRIX_TEST_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("VAELTRIX_TEST_SUPABASE_PUBLISHABLE_KEY")

pytestmark = pytest.mark.skipif(
    not SUPABASE_URL or not SUPABASE_KEY,
    reason=(
        "Butuh VAELTRIX_TEST_SUPABASE_URL + VAELTRIX_TEST_SUPABASE_PUBLISHABLE_KEY "
        "(project Supabase TEST, bukan production) -- lihat docstring file ini."
    ),
)


async def _register_and_get_token(client: httpx.AsyncClient, email: str, password: str) -> str:
    await client.post(f"{SUPABASE_URL}/auth/v1/signup", headers={"apikey": SUPABASE_KEY}, json={"email": email, "password": password})
    res = await client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_KEY},
        json={"email": email, "password": password},
    )
    res.raise_for_status()
    return res.json()["access_token"]


def _auth_headers(token: str) -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"}


def test_user_a_cannot_read_user_b_conversation():
    """Section 49 contoh persis: User A coba baca conversation milik User B
    lewat PostgREST langsung. Kalau ini gagal (balikin data bukan list
    kosong), RLS di tabel `conversations` bolong."""

    async def _run():
        async with httpx.AsyncClient(timeout=30) as client:
            suffix = uuid.uuid4().hex[:8]
            token_a = await _register_and_get_token(client, f"vx-test-a-{suffix}@example.com", "TestPassword123!")
            token_b = await _register_and_get_token(client, f"vx-test-b-{suffix}@example.com", "TestPassword123!")

            create_res = await client.post(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={**_auth_headers(token_b), "Prefer": "return=representation"},
                json={"title": "Punya User B"},
            )
            create_res.raise_for_status()
            conversation_id = create_res.json()[0]["id"]

            read_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers=_auth_headers(token_a),
                params={"id": f"eq.{conversation_id}"},
            )
            read_res.raise_for_status()
            assert read_res.json() == [], "User A HARUSNYA gak bisa lihat conversation User B"

    asyncio.run(_run())


def test_user_a_cannot_read_user_b_project():
    """Section 49 contoh kedua: sama persis tapi buat tabel `projects`."""

    async def _run():
        async with httpx.AsyncClient(timeout=30) as client:
            suffix = uuid.uuid4().hex[:8]
            token_a = await _register_and_get_token(client, f"vx-test-a-{suffix}@example.com", "TestPassword123!")
            token_b = await _register_and_get_token(client, f"vx-test-b-{suffix}@example.com", "TestPassword123!")

            create_res = await client.post(
                f"{SUPABASE_URL}/rest/v1/projects",
                headers={**_auth_headers(token_b), "Prefer": "return=representation"},
                json={"name": "Punya User B"},
            )
            create_res.raise_for_status()
            project_id = create_res.json()[0]["id"]

            read_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/projects",
                headers=_auth_headers(token_a),
                params={"id": f"eq.{project_id}"},
            )
            read_res.raise_for_status()
            assert read_res.json() == [], "User A HARUSNYA gak bisa lihat project User B"

    asyncio.run(_run())


def test_user_a_cannot_update_user_b_conversation():
    """Bukan cuma SELECT -- UPDATE lintas user juga harus ditolak RLS
    (PostgREST balikin 0 baris terupdate, bukan error, jadi kita cek isi
    baris User B TETAP gak berubah)."""

    async def _run():
        async with httpx.AsyncClient(timeout=30) as client:
            suffix = uuid.uuid4().hex[:8]
            token_a = await _register_and_get_token(client, f"vx-test-a-{suffix}@example.com", "TestPassword123!")
            token_b = await _register_and_get_token(client, f"vx-test-b-{suffix}@example.com", "TestPassword123!")

            create_res = await client.post(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={**_auth_headers(token_b), "Prefer": "return=representation"},
                json={"title": "Judul Asli User B"},
            )
            create_res.raise_for_status()
            conversation_id = create_res.json()[0]["id"]

            await client.patch(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers=_auth_headers(token_a),
                params={"id": f"eq.{conversation_id}"},
                json={"title": "Diubah Paksa User A"},
            )

            check_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/conversations",
                headers={**_auth_headers(token_b)},
                params={"id": f"eq.{conversation_id}"},
            )
            check_res.raise_for_status()
            assert check_res.json()[0]["title"] == "Judul Asli User B", "Judul kesenggol User A -- RLS UPDATE bolong"

    asyncio.run(_run())
