"""
Unit test murni (tanpa network/DB) buat logic entitlement -- section 17 & 26
fix. require_model_access() sengaja sync & gak butuh RestClient/DB sama
sekali, jadi bisa dites langsung tanpa mocking apa pun.
"""
import asyncio

import pytest

from app.config import get_settings
from app.core.errors import AppError
from app.services.entitlement_service import (
    MODEL_MIN_TIER,
    TIER_ORDER,
    check_rate_limit,
    require_model_access,
)


def test_free_models_allowed_for_free_tier():
    # flash & lite (mode BYOK yg selama ini gratis) HARUS tetap gratis --
    # gak boleh keubah gara-gara fix premium.
    require_model_access("free", "vaeltrix-flash")
    require_model_access("free", "vaeltrix-lite")


def test_max_model_rejected_for_free_tier():
    with pytest.raises(AppError) as exc:
        require_model_access("free", "vaeltrix-max")
    assert exc.value.code == "AUTHORIZATION_ERROR"
    assert exc.value.status_code == 403


@pytest.mark.parametrize("tier", ["premium", "pro"])
def test_max_model_allowed_for_paid_tiers(tier):
    # Gak boleh raise -- kalau raise, test ini gagal duluan.
    require_model_access(tier, "vaeltrix-max")


def test_unknown_model_id_defaults_to_free_gate():
    # modelId yang gak dikenal HARUS diperlakukan kayak free (paling ketat
    # yang aman), bukan malah lolos tanpa gating sama sekali.
    require_model_access("free", "model-yang-gak-ada")


def test_tier_order_is_ascending():
    assert TIER_ORDER.index("free") < TIER_ORDER.index("premium") < TIER_ORDER.index("pro")


def test_message_limit_matches_frontend_constants():
    # PERSIS FREE_LIMIT=20 / PREMIUM_LIMIT=60 di 01-config.js -- kalau salah
    # satu berubah, test ini WAJIB diupdate bareng, bukan dibiarkan diam-diam
    # beda. Section 26 fix: nilainya sekarang dari Settings (.env), bukan
    # dict hardcode -- test ini ngecek DEFAULT-nya tetap sama kayak sebelumnya.
    settings = get_settings()
    assert settings.free_tier_message_limit == 20
    assert settings.premium_tier_message_limit == 60


def test_model_min_tier_only_max_requires_upgrade():
    assert MODEL_MIN_TIER["vaeltrix-flash"] == "free"
    assert MODEL_MIN_TIER["vaeltrix-lite"] == "free"
    assert MODEL_MIN_TIER["vaeltrix-max"] == "premium"


# ---------------------------------------------------------------------------
# check_rate_limit (section 17 fix / migration 0007) -- ini ngetes GLUE
# LOGIC-nya doang (pemanggilan RPC yang bener + interpretasi hasilnya),
# BUKAN ngebuktiin atomisitas beneran di Postgres-nya (itu butuh koneksi DB
# beneran buat concurrency test section 50, di luar jangkauan unit test
# tanpa network/DB kayak file ini). db.rpc() di-mock manual di sini, gak
# pakai pytest-asyncio (belum jadi dependency proyek ini) -- asyncio.run()
# biasa udah cukup buat manggil satu fungsi async dari test yang sync.
class _FakeDb:
    def __init__(self, rpc_result):
        self._rpc_result = rpc_result
        self.rpc_calls = []

    async def rpc(self, function_name, params=None):
        self.rpc_calls.append((function_name, params))
        return self._rpc_result


def test_check_rate_limit_passes_when_rpc_allows():
    db = _FakeDb(rpc_result=True)
    asyncio.run(check_rate_limit(db, "user-1", "free"))  # gak boleh raise
    name, params = db.rpc_calls[0]
    assert name == "check_and_reserve_rate_limit"
    assert params == {"p_limit": 20, "p_window_minutes": get_settings().chat_rate_limit_window_minutes}


def test_check_rate_limit_blocks_when_rpc_denies():
    db = _FakeDb(rpc_result=False)
    with pytest.raises(AppError) as exc:
        asyncio.run(check_rate_limit(db, "user-1", "free"))
    assert exc.value.code == "RATE_LIMIT_ERROR"
    assert exc.value.status_code == 429


@pytest.mark.parametrize("tier,expected_limit", [("free", 20), ("premium", 60), ("pro", 60)])
def test_check_rate_limit_sends_correct_limit_per_tier(tier, expected_limit):
    db = _FakeDb(rpc_result=True)
    asyncio.run(check_rate_limit(db, "user-1", tier))
    assert db.rpc_calls[0][1]["p_limit"] == expected_limit
