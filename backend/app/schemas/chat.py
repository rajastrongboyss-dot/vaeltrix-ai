from pydantic import BaseModel, Field

from app.config import get_settings

# Section 26 fix: batas di bawah SEBELUMNYA angka literal langsung di
# Field(max_length=...) -- gak bisa diubah tanpa ubah kode+redeploy. Dibaca
# SEKALI di sini pas modul ini pertama di-import (awal proses backend jalan),
# konsisten sama pola @lru_cache di get_settings() sendiri.
_settings = get_settings()


class ChatStreamRequest(BaseModel):
    conversationId: str | None = None
    projectId: str | None = None
    modelId: str
    # Section 19 fix: SEBELUMNYA gak ada batas atas sama sekali -- cuma ketahan
    # MaxBodySizeMiddleware (2MB, generik buat semua endpoint).
    systemPrompt: str = Field(default="", max_length=_settings.max_system_prompt_length)
    message: str = Field(min_length=1, max_length=_settings.max_message_length)
