"""
Adapter Groq (OpenAI-compatible chat completions) -- base URL & bentuk request
PERSIS yang sudah dipakai jalur BYOK (lihat GROQ_BASE + buildGroqMessages,
07-providers.js): role "system" native, streaming SSE format OpenAI standar
("data: {...}", ditutup "data: [DONE]").
"""
import json
from collections.abc import AsyncIterator

import httpx

from app.providers.base import ProviderError

GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions"


async def stream_groq(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    history: list[dict],
    message: str,
    max_tokens: int,
    usage_out: dict | None = None,
) -> AsyncIterator[str]:
    """Yield potongan teks (delta) satu-satu. Raise ProviderError kalau gagal.
    usage_out diisi best-effort (lihat catatan di stream_gemini) -- minta
    "stream_options.include_usage" (kontrak OpenAI-compatible standar), tapi
    tetap gak crash kalau Groq gak nyertain itu di responsnya."""
    messages: list[dict] = []
    if system_prompt and system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt})
    messages += [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": message})

    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client, client.stream(
            "POST", GROQ_BASE, headers={"Authorization": f"Bearer {api_key}"}, json=body
        ) as res:
            if res.status_code >= 400:
                raw = await res.aread()
                retryable = res.status_code == 429 or res.status_code >= 500
                raise ProviderError(
                    f"Groq HTTP {res.status_code}: {raw.decode(errors='ignore')[:200]}", retryable
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
                    choices = payload.get("choices") or [{}]
                    delta = (choices[0].get("delta") or {}).get("content") or ""
                    if delta:
                        yield delta
                    if usage_out is not None:
                        total = (payload.get("usage") or {}).get("total_tokens")
                        if isinstance(total, int):
                            usage_out["total_tokens"] = total
    except httpx.HTTPError as e:
        raise ProviderError(f"Groq Tidak Bisa Dihubungi: {e}", retryable=True) from e
