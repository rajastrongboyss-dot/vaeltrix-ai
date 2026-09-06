"""
Unit test murni buat cursor pagination (section 21 fix) -- encode/decode
adalah fungsi pure (base64 + string split), gak butuh DB sama sekali.
"""
import asyncio

import pytest

from app.core.errors import AppError
from app.services.conversation_service import _decode_cursor, _encode_cursor, list_conversations


def test_cursor_roundtrip():
    cursor = _encode_cursor("2026-01-15T10:30:00+00:00", "conv-abc-123")
    updated_at, conversation_id = _decode_cursor(cursor)
    assert updated_at == "2026-01-15T10:30:00+00:00"
    assert conversation_id == "conv-abc-123"


def test_decode_invalid_cursor_raises_validation_error():
    with pytest.raises(AppError) as exc:
        _decode_cursor("not-valid-base64-or-missing-separator!!!")
    assert exc.value.code == "VALIDATION_ERROR"


class _FakeDb:
    def __init__(self, rows):
        self._rows = rows
        self.select_calls = []

    async def select(self, table, params):
        self.select_calls.append((table, params))
        return self._rows


class _FakeUser:
    def __init__(self, rows):
        self.db = _FakeDb(rows)


def test_list_conversations_returns_next_cursor_when_more_rows_exist():
    # limit=2, tapi backend "punya" 3 baris (limit+1 fetch trick) -- baris ke-3
    # HARUS dipotong dari hasil, dan nextCursor harus dihitung dari baris
    # TERAKHIR yang beneran dikembalikan (baris ke-2), bukan baris ke-3.
    rows = [
        {"id": "c1", "title": "Satu", "modelId": "vaeltrix-flash", "updatedAt": "2026-01-03T00:00:00+00:00"},
        {"id": "c2", "title": "Dua", "modelId": "vaeltrix-flash", "updatedAt": "2026-01-02T00:00:00+00:00"},
        {"id": "c3", "title": "Tiga", "modelId": "vaeltrix-flash", "updatedAt": "2026-01-01T00:00:00+00:00"},
    ]
    user = _FakeUser(rows)

    items, next_cursor = asyncio.run(list_conversations(user, limit=2))

    assert len(items) == 2
    assert [i["id"] for i in items] == ["c1", "c2"]
    assert next_cursor == _encode_cursor("2026-01-02T00:00:00+00:00", "c2")
    # limit+1 yang beneran diminta ke DB, bukan limit apa adanya
    assert user.db.select_calls[0][1]["limit"] == "3"


def test_list_conversations_returns_no_next_cursor_when_exhausted():
    rows = [{"id": "c1", "title": "Satu", "modelId": "vaeltrix-flash", "updatedAt": "2026-01-01T00:00:00+00:00"}]
    user = _FakeUser(rows)

    items, next_cursor = asyncio.run(list_conversations(user, limit=50))

    assert len(items) == 1
    assert next_cursor is None


def test_list_conversations_with_cursor_sends_or_filter():
    user = _FakeUser([])
    cursor = _encode_cursor("2026-01-02T00:00:00+00:00", "c2")

    asyncio.run(list_conversations(user, limit=50, cursor=cursor))

    sent_params = user.db.select_calls[0][1]
    assert "updated_at.lt.2026-01-02T00:00:00+00:00" in sent_params["or"]
    assert "id.lt.c2" in sent_params["or"]
