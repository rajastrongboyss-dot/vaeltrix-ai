from pydantic import BaseModel, Field

from app.config import get_settings

_settings = get_settings()  # Section 26 fix -- lihat komentar sama di schemas/chat.py


class MessageIn(BaseModel):
    role: str  # divalidasi ketat ("user"/"assistant") di service layer
    content: str = Field(max_length=_settings.max_imported_message_content_length)


class ConversationImportRequest(BaseModel):
    title: str = Field(max_length=_settings.max_conversation_title_length)
    modelId: str
    projectId: str | None = None
    messages: list[MessageIn] = Field(max_length=_settings.max_imported_messages_count)
