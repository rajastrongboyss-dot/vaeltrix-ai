"""Helper kecil biar semua response sukses konsisten {"success": true, "data": ...}."""
from typing import Any


def ok(data: Any) -> dict:
    return {"success": True, "data": data}
