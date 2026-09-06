"""
Unit test murni buat MaxBodySizeMiddleware (section 19, oversized payload).
Di-test langsung lewat .dispatch() dengan objek request/call_next palsu
seminimal mungkin -- TIDAK butuh TestClient/server ASGI beneran, karena
middleware ini cuma baca satu header (`content-length`), gak nyentuh apa pun
yang lain dari request/response asli.
"""
import asyncio

from app.main import MAX_REQUEST_BODY_BYTES, MaxBodySizeMiddleware, SecurityHeadersMiddleware


class _FakeHeaders:
    def __init__(self, content_length):
        self._content_length = content_length

    def get(self, key, default=None):
        return self._content_length if key == "content-length" else default


class _FakeRequest:
    def __init__(self, content_length):
        self.headers = _FakeHeaders(content_length)


def _middleware():
    return MaxBodySizeMiddleware(app=None)


def test_oversized_content_length_rejected_with_413():
    request = _FakeRequest(content_length=str(MAX_REQUEST_BODY_BYTES + 1))

    async def call_next(_req):
        raise AssertionError("call_next TIDAK boleh kepanggil kalau body sudah kelewat besar")

    response = asyncio.run(_middleware().dispatch(request, call_next))
    assert response.status_code == 413


def test_content_length_within_limit_passes_through():
    request = _FakeRequest(content_length=str(1024))
    called = []

    async def call_next(req):
        called.append(req)
        return "downstream-response"

    response = asyncio.run(_middleware().dispatch(request, call_next))
    assert response == "downstream-response"
    assert called == [request]


def test_missing_content_length_passes_through():
    # CATATAN JUJUR yang sudah ada di komentar main.py: klien yang sengaja gak
    # ngirim Content-Length (mis. chunked transfer encoding) LOLOS cek ini.
    # Test ini sengaja mendokumentasikan batasan itu apa adanya, bukan
    # berpura-pura middleware ini menutup semua kemungkinan.
    request = _FakeRequest(content_length=None)

    async def call_next(_req):
        return "downstream-response"

    response = asyncio.run(_middleware().dispatch(request, call_next))
    assert response == "downstream-response"


# ---------------------------------------------------------------------------
# SecurityHeadersMiddleware (section 58) -- sengaja TIDAK ngetest Content-
# Security-Policy karena middleware ini sengaja TIDAK mengirim CSP sama sekali
# (lihat docstring class-nya soal kenapa: arsitektur onclick inline).
class _FakeResponse:
    def __init__(self):
        self.headers = {}


def test_security_headers_added_in_development(monkeypatch):
    import app.main as main_module

    class FakeSettings:
        app_env = "development"

    monkeypatch.setattr(main_module, "get_settings", lambda: FakeSettings())

    async def call_next(_req):
        return _FakeResponse()

    response = asyncio.run(main_module.SecurityHeadersMiddleware(app=None).dispatch(None, call_next))
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "Strict-Transport-Security" not in response.headers, "HSTS TIDAK boleh terkirim di luar production"


def test_hsts_only_sent_in_production(monkeypatch):
    import app.main as main_module

    class FakeSettings:
        app_env = "production"

    monkeypatch.setattr(main_module, "get_settings", lambda: FakeSettings())

    async def call_next(_req):
        return _FakeResponse()

    response = asyncio.run(main_module.SecurityHeadersMiddleware(app=None).dispatch(None, call_next))
    assert "max-age=31536000" in response.headers["Strict-Transport-Security"]
