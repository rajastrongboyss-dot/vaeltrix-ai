"""
Kontrak yang sudah diasumsikan frontend di 18-cloud-sync.js:
- GET  /conversations?limit=50[&cursor=...] -> {items:[...], nextCursor: string|null}
- GET  /conversations/{id}       -> {conversation:{..., messages:[{id,role,content,model}]}}
- POST /conversations/import     -> {conversation:{id}}
- DELETE /conversations/{id}

Section 21 fix: SEBELUMNYA cuma `?limit=50` tanpa mekanisme lanjutan -- user
dengan >50 percakapan ter-sync gak akan pernah keambil sisanya pas login di
device baru (vaeltrixSyncConversationList di 18-cloud-sync.js cuma fetch
SEKALI, gak looping). Sekarang cursor-based: `nextCursor` di response, kirim
balik sebagai `?cursor=...` buat halaman berikutnya. `null` = udah halaman
terakhir.
"""
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, get_current_user
from app.core.responses import ok
from app.schemas.conversation import ConversationImportRequest
from app.services import conversation_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("")
async def list_conversations(
    user: CurrentUser = Depends(get_current_user),
    limit: int = Query(default=50, le=100),
    cursor: str | None = None,
):
    items, next_cursor = await conversation_service.list_conversations(user, limit, cursor)
    return ok({"items": items, "nextCursor": next_cursor})


@router.post("/import", status_code=201)
async def import_conversation(
    payload: ConversationImportRequest,
    user: CurrentUser = Depends(get_current_user),
):
    conversation = await conversation_service.import_conversation(user, payload)
    return ok({"conversation": conversation})


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, user: CurrentUser = Depends(get_current_user)):
    conversation = await conversation_service.get_conversation(user, conversation_id)
    return ok({"conversation": conversation})


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user: CurrentUser = Depends(get_current_user)):
    await conversation_service.delete_conversation(user, conversation_id)
    return ok(None)
