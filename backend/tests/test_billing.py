"""
Unit test murni buat billing_service.handle_webhook -- section 25 fix
(idempotensi, migration 0007). stripe.Webhook.construct_event, get_settings,
dan PrivilegedRestClient semua di-monkeypatch manual -- gak butuh
STRIPE_WEBHOOK_SECRET/SUPABASE_SECRET_KEY beneran atau koneksi Stripe/Supabase
asli sama sekali.
"""
import asyncio

import pytest

import app.services.billing_service as billing_service
from app.integrations.supabase_client import SupabaseRestError


class _FakePrivileged:
    def __init__(self, insert_error=None):
        self._insert_error = insert_error
        self.insert_calls = []

    async def insert_one(self, table, data):
        self.insert_calls.append((table, data))
        if self._insert_error:
            raise self._insert_error
        return {"event_id": data["event_id"]}


class _FakeSettings:
    stripe_webhook_secret = "whsec_test"


def _patch_common(monkeypatch, fake_event, fake_privileged):
    monkeypatch.setattr(billing_service.stripe.Webhook, "construct_event", lambda *a, **k: fake_event)
    monkeypatch.setattr(billing_service, "get_settings", lambda: _FakeSettings())
    monkeypatch.setattr(billing_service, "PrivilegedRestClient", lambda: fake_privileged)


def test_duplicate_webhook_event_is_ignored_not_reprocessed(monkeypatch):
    # event_id yang SAMA kirim dua kali (retry Stripe) -- yang kedua HARUS
    # berhenti diam-diam di titik insert, TIDAK boleh lanjut ke pemrosesan
    # event_type di bawahnya (kalau lanjut, tier/subscription bisa keupdate dua kali).
    fake_event = {"id": "evt_123", "type": "checkout.session.completed", "data": {"object": {}}}
    fake_privileged = _FakePrivileged(insert_error=SupabaseRestError("conflict", 409))
    _patch_common(monkeypatch, fake_event, fake_privileged)

    asyncio.run(billing_service.handle_webhook(b"{}", "sig"))  # gak boleh raise

    assert fake_privileged.insert_calls == [
        ("processed_stripe_events", {"event_id": "evt_123", "event_type": "checkout.session.completed"})
    ]


def test_non_conflict_insert_error_still_raises(monkeypatch):
    # Error LAIN (bukan 409 duplikat, mis. 500 DB down) harus tetap ke-raise
    # apa adanya -- jangan sampai ketertelan jadi "sukses diam-diam" juga.
    fake_event = {"id": "evt_456", "type": "checkout.session.completed", "data": {"object": {}}}
    fake_privileged = _FakePrivileged(insert_error=SupabaseRestError("server error", 500))
    _patch_common(monkeypatch, fake_event, fake_privileged)

    with pytest.raises(SupabaseRestError):
        asyncio.run(billing_service.handle_webhook(b"{}", "sig"))
