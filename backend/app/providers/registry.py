"""
Model registry -- satu-satunya sumber kebenaran modelId ("vaeltrix-*") -> model
provider asli + urutan fallback. Dasarnya PERSIS MODELS/MODE_TO_BACKEND_MODEL_ID
di 01-config.js & 07-providers.js (bukan dikarang):
  - mode flash            -> gemini-3.6-flash
  - mode lite             -> Groq openai/gpt-oss-120b (fallback 20b)
  - mode code/maxs/research (semua dipetakan ke "vaeltrix-max") -> tingkat
    Gemini Pro (pro-preview -> pro -> flash sebagai jaring pengaman terakhir)

Nambah model baru cukup ubah/tambah baris di bawah -- tidak perlu mengubah
providers/gemini.py, providers/groq.py, atau services/chat_service.py.

CATATAN JUJUR: "Upaya"/thinkingLevel/reasoning_effort dari jalur BYOK SENGAJA
belum dibawa ke sini -- kontrak /api/v1/chat/stream yang sudah diasumsikan
frontend (07-providers.js: callVaeltrixBackend) tidak mengirim parameter itu
sama sekali, jadi ini bukan fitur yang "hilang", cuma belum ada tempatnya di
kontrak saat ini. Model dipanggil pakai setting default provider masing-masing.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelStep:
    provider: str  # "gemini" | "groq"
    model: str
    max_tokens: int


MODEL_REGISTRY: dict[str, list[ModelStep]] = {
    "vaeltrix-flash": [
        ModelStep("gemini", "gemini-3.6-flash", 9281),
    ],
    "vaeltrix-lite": [
        ModelStep("groq", "openai/gpt-oss-120b", 4096),
        ModelStep("groq", "openai/gpt-oss-20b", 4096),
    ],
    "vaeltrix-max": [
        ModelStep("gemini", "gemini-3.1-pro-preview", 9281),
        ModelStep("gemini", "gemini-3.1-pro", 9282),
        ModelStep("gemini", "gemini-3.6-flash", 9281),
    ],
}

DEFAULT_MODEL_ID = "vaeltrix-flash"


def resolve_chain(model_id: str) -> list[ModelStep]:
    return MODEL_REGISTRY.get(model_id) or MODEL_REGISTRY[DEFAULT_MODEL_ID]
