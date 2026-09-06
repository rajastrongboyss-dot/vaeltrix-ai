"""Tipe & exception yang dipakai bersama semua provider adapter (Gemini, Groq, dst)."""


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = False):
        self.message = message
        self.retryable = retryable
        super().__init__(message)
