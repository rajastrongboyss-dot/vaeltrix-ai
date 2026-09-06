"""
Unit test murni buat format SSE custom yang diasumsikan frontend
(callVaeltrixBackend, 07-providers.js) -- PENTING: ini bukan EventSource
standar, frontend baca manual lewat fetch+ReadableStream dan expect frame
persis "data: {json}\\n\\n" dengan key type/conversationId/text/message/messageId
EXACT seperti di bawah (camelCase, bukan snake_case).
"""
import json

from app.services.chat_service import _sse


def _decode(frame: bytes) -> dict:
    text = frame.decode("utf-8")
    assert text.startswith("data: ")
    assert text.endswith("\n\n")
    return json.loads(text[len("data: "):].strip())


def test_start_event_shape():
    payload = _decode(_sse("start", conversationId="abc-123"))
    assert payload == {"type": "start", "conversationId": "abc-123"}


def test_chunk_event_shape():
    payload = _decode(_sse("chunk", text="Halo dunia"))
    assert payload == {"type": "chunk", "text": "Halo dunia"}


def test_error_event_shape():
    payload = _decode(_sse("error", message="Model Lagi Bermasalah."))
    assert payload == {"type": "error", "message": "Model Lagi Bermasalah."}


def test_done_event_shape_with_message_id():
    payload = _decode(_sse("done", messageId="msg-789"))
    assert payload == {"type": "done", "messageId": "msg-789"}


def test_done_event_shape_when_save_failed():
    # chat_service sengaja masih kirim "done" dgn messageId=None kalau nyimpen
    # ke DB gagal SETELAH jawaban lengkap ke-stream -- jangan sampai regresi
    # jadi field messageId ilang total dari payload-nya.
    payload = _decode(_sse("done", messageId=None))
    assert payload == {"type": "done", "messageId": None}


def test_frame_contains_no_stray_newlines_inside_json():
    # Delta teks yang multi-baris HARUS tetap 1 frame valid (JSON escape "\n"
    # dengan benar) -- kalau enggak, parser "split by \\n\\n" di frontend bisa
    # kepotong di tengah.
    frame = _sse("chunk", text="baris 1\nbaris 2")
    text = frame.decode("utf-8")
    # Cuma boleh ada TEPAT SATU "\n\n" (si pemisah frame, di akhir) --
    # newline dari isi delta harus ke-escape jadi literal \n di dalam JSON.
    assert text.count("\n\n") == 1
    assert text.endswith("\n\n")
    payload = _decode(frame)
    assert payload["text"] == "baris 1\nbaris 2"
