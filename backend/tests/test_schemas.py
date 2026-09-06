"""
Unit test validasi schema Pydantic -- pure, gak butuh network/DB. Ini juga
dokumentasi hidup soal aturan validasi tiap field request (kalau salah satu
sengaja diubah nanti, test yang harus diupdate, bukan diam-diam beda).
"""
import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.chat import ChatStreamRequest
from app.schemas.conversation import ConversationImportRequest, MessageIn
from app.schemas.project import ProjectCreateRequest


def test_register_rejects_password_under_8_chars():
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.com", password="short")


def test_register_rejects_invalid_email():
    with pytest.raises(ValidationError):
        RegisterRequest(email="bukan-email", password="password123")


def test_register_accepts_valid_payload_without_name():
    req = RegisterRequest(email="a@b.com", password="password123")
    assert req.name is None


def test_login_requires_both_fields():
    with pytest.raises(ValidationError):
        LoginRequest(email="a@b.com")  # password wajib, gak ada default


def test_chat_stream_rejects_empty_message():
    with pytest.raises(ValidationError):
        ChatStreamRequest(modelId="vaeltrix-flash", message="")


def test_chat_stream_allows_missing_conversation_and_project_id():
    req = ChatStreamRequest(modelId="vaeltrix-flash", message="hai")
    assert req.conversationId is None
    assert req.projectId is None
    assert req.systemPrompt == ""


def test_conversation_import_requires_messages_list():
    with pytest.raises(ValidationError):
        ConversationImportRequest(title="t", modelId="vaeltrix-flash")  # messages wajib


def test_conversation_import_accepts_user_and_assistant_roles():
    req = ConversationImportRequest(
        title="t",
        modelId="vaeltrix-flash",
        messages=[MessageIn(role="user", content="hai"), MessageIn(role="assistant", content="halo")],
    )
    assert len(req.messages) == 2


# ---------------------------------------------------------------------------
# Section 19 fix -- field-field ini SEBELUMNYA gak punya batas atas sama
# sekali (cuma ketahan MaxBodySizeMiddleware yang generik, 2MB buat semua
# endpoint). Test di bawah mendokumentasikan batas SPESIFIK per field
# sekarang, biar kalau nanti sengaja diubah, test ini yang kena update duluan.
def test_chat_stream_rejects_oversized_message():
    with pytest.raises(ValidationError):
        ChatStreamRequest(modelId="vaeltrix-flash", message="x" * 8001)


def test_chat_stream_accepts_message_at_exact_limit():
    req = ChatStreamRequest(modelId="vaeltrix-flash", message="x" * 8000)
    assert len(req.message) == 8000


def test_chat_stream_rejects_oversized_system_prompt():
    with pytest.raises(ValidationError):
        ChatStreamRequest(modelId="vaeltrix-flash", message="hai", systemPrompt="x" * 4001)


def test_conversation_import_rejects_oversized_title():
    with pytest.raises(ValidationError):
        ConversationImportRequest(title="x" * 201, modelId="vaeltrix-flash", messages=[])


def test_conversation_import_rejects_too_many_messages():
    with pytest.raises(ValidationError):
        ConversationImportRequest(
            title="t", modelId="vaeltrix-flash", messages=[MessageIn(role="user", content="hai")] * 2001
        )


def test_message_in_rejects_oversized_content():
    with pytest.raises(ValidationError):
        MessageIn(role="user", content="x" * 20001)


def test_project_create_rejects_oversized_name():
    with pytest.raises(ValidationError):
        ProjectCreateRequest(name="x" * 201)


def test_project_create_rejects_oversized_instructions():
    with pytest.raises(ValidationError):
        ProjectCreateRequest(name="Proyek", instructions="x" * 8001)


def test_project_create_allows_missing_instructions():
    req = ProjectCreateRequest(name="Proyek")
    assert req.instructions is None
