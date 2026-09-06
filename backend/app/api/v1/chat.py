"""
Kontrak PERSIS yang diasumsikan callVaeltrixBackend (07-providers.js):
POST /api/v1/chat/stream, body {conversationId?, projectId?, modelId,
systemPrompt, message}, balikin SSE custom (bukan EventSource standar --
frontend baca manual lewat fetch + ReadableStream) dengan event
start/chunk/error/done. Lihat services/chat_service.py untuk kontrak detail
tiap event.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.dependencies import CurrentUser, get_current_user
from app.schemas.chat import ChatStreamRequest
from app.services import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(payload: ChatStreamRequest, user: CurrentUser = Depends(get_current_user)):
    # Validasi (project/conversation milik user?) WAJIB kelar duluan di sini --
    # kalau gagal, ini masih response JSON normal (404/422), BUKAN event SSE
    # (lihat komentar di chat_service.resolve_conversation).
    conversation_id, history = await chat_service.resolve_conversation(user, payload)

    return StreamingResponse(
        chat_service.stream_response(user, payload, conversation_id, history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
