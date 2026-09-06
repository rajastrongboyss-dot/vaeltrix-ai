"""
Adapter Gemini -- base URL & pola streaming PERSIS yang sudah dipakai jalur
BYOK (lihat GEMINI_BASE + parsing SSE di callGeminiAPI, 07-providers.js):
endpoint "{model}:streamGenerateContent?alt=sse&key=...", tiap frame SSE
"data: {...}" isinya delta text di candidates[0].content.parts[].text.

Bedanya sengaja: di sini pakai field "systemInstruction" bawaan Gemini,
BUKAN hack "role:user + balasan model palsu" yang dipakai kode BYOK -- tidak
ada kode existing yang gantung ke hack itu di jalur backend (endpoint ini baru,
belum pernah ada implementasinya), dan systemInstruction adalah cara resmi
Gemini buat ini, jadi observable behavior (system prompt kepakai) tetap sama
persis, cuma lebih bersih & hemat token.
"""
import json
from collections.abc import AsyncIterator

import httpx

from app.providers.base import ProviderError

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _history_to_contents(history: list[dict]) -> list[dict]:
    return [
        {"role": "user" if h["role"] == "user" else "model", "parts": [{"text": h["content"]}]}
        for h in history
    ]


async def stream_gemini(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    history: list[dict],
    message: str,
    max_tokens: int,
    usage_out: dict | None = None,
) -> AsyncIterator[str]:
    """Yield potongan teks (delta, BUKAN kumulatif) satu-satu. Raise ProviderError
    kalau gagal. Kalau usage_out (dict) dikasih, diisi best-effort dengan
    {"total_tokens": ...} begitu Gemini nyertain usageMetadata di response --
    TIDAK pernah dikarang kalau field-nya gak ada/beda bentuk (section 40:
    anti-hallucination -- lebih baik gak ada angka daripada angka ngasal)."""
    contents = _history_to_contents(history) + [{"role": "user", "parts": [{"text": message}]}]
    body: dict = {
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": max_tokens},
    }
    if system_prompt and system_prompt.strip():
        # Sengaja gak dikirim sama sekali kalau kosong -- daripada asumsi Gemini
        # toleran systemInstruction berisi string kosong (gak bisa dicek live).
        body["systemInstruction"] = {"parts": [{"text": system_prompt}]}
    url = f"{GEMINI_BASE}/{model}:streamGenerateContent"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client, client.stream(
            "POST", url, params={"alt": "sse", "key": api_key}, json=body
        ) as res:
            if res.status_code >= 400:
                raw = await res.aread()
                retryable = res.status_code == 429 or res.status_code >= 500
                raise ProviderError(
                    f"Gemini HTTP {res.status_code}: {raw.decode(errors='ignore')[:200]}", retryable
                )

            buffer = ""
            async for raw_chunk in res.aiter_text():
                buffer += raw_chunk
                lines = buffer.split("\n")
                buffer = lines.pop()
                for line in lines:
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if not data_str or data_str == "[DONE]":
                        continue
                    try:
                        payload = json.loads(data_str)
                    except ValueError:
                        continue
                    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                    delta = "".join(p.get("text", "") for p in parts if not p.get("thought"))
                    if delta:
                        yield delta
                    if usage_out is not None:
                        total = payload.get("usageMetadata", {}).get("totalTokenCount")
                        if isinstance(total, int):
                            usage_out["total_tokens"] = total
    except httpx.HTTPError as e:
        raise ProviderError(f"Gemini Tidak Bisa Dihubungi: {e}", retryable=True) from e
