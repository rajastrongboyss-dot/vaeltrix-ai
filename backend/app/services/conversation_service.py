"""
Business logic conversations -- semua akses tabel LEWAT user.db (RestClient
yang sudah discope RLS pakai access token user, lihat core/dependencies.py).
Backend tidak pernah pakai secret/service key di sini -- ownership ditegakkan
Postgres RLS + double-check eksplisit di bawah untuk kasus yang RLS sendiri
tidak otomatis tangani (section 10 master prompt).
"""
import base64

from app.core.dependencies import CurrentUser
from app.core.errors import AppError
from app.integrations.supabase_client import SupabaseRestError
from app.schemas.conversation import ConversationImportRequest

ALLOWED_IMPORT_ROLES = {"user", "assistant"}


def _encode_cursor(updated_at: str, conversation_id: str) -> str:
    raw = f"{updated_at}|{conversation_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[str, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        updated_at, conversation_id = raw.split("|", 1)
        return updated_at, conversation_id
    except Exception as e:
        raise AppError("VALIDATION_ERROR", "Cursor Tidak Valid.", status_code=422) from e


async def list_conversations(user: CurrentUser, limit: int, cursor: str | None = None) -> tuple[list[dict], str | None]:
    params = {
        "select": "id,title,modelId:model_id,updatedAt:updated_at",
        "order": "updated_at.desc,id.desc",
        # Ambil satu ekstra -- dipakai buat nentuin ADA gak halaman berikutnya,
        # bukan buat dikembalikan ke caller (dipotong lagi di bawah).
        "limit": str(limit + 1),
    }
    if cursor:
        cursor_updated_at, cursor_id = _decode_cursor(cursor)
        params["or"] = f"(updated_at.lt.{cursor_updated_at},and(updated_at.eq.{cursor_updated_at},id.lt.{cursor_id}))"

    rows = await user.db.select("conversations", params)

    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = _encode_cursor(last["updatedAt"], last["id"])

    return rows, next_cursor


async def get_conversation(user: CurrentUser, conversation_id: str) -> dict:
    convs = await user.db.select(
        "conversations",
        {
            "select": "id,title,modelId:model_id,projectId:project_id,createdAt:created_at,updatedAt:updated_at",
            "id": f"eq.{conversation_id}",
        },
    )
    if not convs:
        raise AppError("NOT_FOUND", "Percakapan Tidak Ditemukan.", status_code=404)

    messages = await user.db.select(
        "messages",
        {"select": "id,role,content,model", "conversation_id": f"eq.{conversation_id}", "order": "created_at.asc"},
    )
    conversation = convs[0]
    conversation["messages"] = messages
    return conversation


async def import_conversation(user: CurrentUser, payload: ConversationImportRequest) -> dict:
    if not payload.messages:
        raise AppError("VALIDATION_ERROR", "Percakapan Kosong, Tidak Ada Yang Diimpor.", status_code=422)

    for m in payload.messages:
        if m.role not in ALLOWED_IMPORT_ROLES:
            raise AppError("VALIDATION_ERROR", f"Role Pesan Tidak Valid: {m.role}", status_code=422)

    project_id = None
    if payload.projectId:
        # Jangan percaya projectId dari client mentah-mentah -- pastikan project
        # itu BENAR milik user ini. RLS insert di tabel conversations cuma
        # ngecek user_id conversations-nya sendiri, TIDAK otomatis memvalidasi
        # bahwa project_id yang direferensikan juga milik user yang sama.
        found = await user.db.select("projects", {"select": "id", "id": f"eq.{payload.projectId}"})
        if not found:
            raise AppError("VALIDATION_ERROR", "Project Tidak Ditemukan.", status_code=422)
        project_id = payload.projectId

    try:
        conv = await user.db.insert_one(
            "conversations",
            {
                "user_id": user.id,
                "title": payload.title or "Percakapan",
                "model_id": payload.modelId,
                "project_id": project_id,
            },
        )
        message_rows = [
            {"conversation_id": conv["id"], "user_id": user.id, "role": m.role, "content": m.content}
            for m in payload.messages
        ]
        await user.db.insert_many("messages", message_rows)
    except SupabaseRestError as e:
        raise AppError("INTERNAL_ERROR", "Gagal Menyimpan Percakapan.", status_code=500) from e

    return {"id": conv["id"]}


async def delete_conversation(user: CurrentUser, conversation_id: str) -> None:
    deleted = await user.db.delete("conversations", {"id": f"eq.{conversation_id}"})
    if not deleted:
        raise AppError("NOT_FOUND", "Percakapan Tidak Ditemukan.", status_code=404)
