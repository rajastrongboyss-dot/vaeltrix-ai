"""
Orkestrasi /api/v1/chat/stream. Dipecah 2 fase, PERSIS mengikuti asumsi
frontend di callVaeltrixBackend (07-providers.js):

1. resolve_conversation() -- validasi (project_id milik user? conversationId
   ada & milik user?) SEBELUM response streaming dimulai. Gagal di sini =
   AppError = balik ke frontend sebagai JSON biasa {success:false,error:{...}}
   dengan status HTTP yang bener (404/422/dst) -- lihat komentar frontend:
   "Gagal SEBELUM streaming mulai -- backend balikin JSON biasa, bukan SSE."

2. stream_response() -- generator yang beneran dipanggil dari dalam
   StreamingResponse. Begitu ini mulai jalan, HTTP response udah commit ke 200,
   jadi kegagalan dari sini dan seterusnya (mis. provider AI down) WAJIB
   dikirim sebagai event SSE {type:"error"}, bukan exception mentah.
"""
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from app.core.dependencies import CurrentUser
from app.core.errors import AppError
from app.core.logging import get_logger
from app.providers.base import ProviderError
from app.providers.gemini import stream_gemini
from app.providers.groq import stream_groq
from app.providers.registry import ModelStep, resolve_chain
from app.schemas.chat import ChatStreamRequest
from app.config import get_settings
from app.services import entitlement_service

logger = get_logger("app.chat")

STREAM_FUNCTIONS = {"gemini": stream_gemini, "groq": stream_groq}


def _sse(event_type: str, **fields) -> bytes:
    return f"data: {json.dumps({'type': event_type, **fields})}\n\n".encode("utf-8")


def _api_keys_for(provider: str) -> list[str]:
    settings = get_settings()
    raw = settings.gemini_api_keys if provider == "gemini" else settings.groq_api_keys
    return [k.strip() for k in raw.split(",") if k.strip()]


async def resolve_conversation(user: CurrentUser, payload: ChatStreamRequest) -> tuple[str, list[dict]]:
    """Validasi & siapkan conversation SEBELUM streaming dimulai. Balikin
    (conversation_id, history). Raise AppError kalau ada yang gak valid."""
    # Section 17 & 26 fix: tier & rate limit divalidasi server-side DI SINI --
    # pre-stream, jadi penolakan balik sebagai JSON error biasa (403/429), bukan
    # event SSE. Tier cuma di-fetch SEKALI, dipakai buat dua pengecekan sekaligus.
    tier = await entitlement_service.get_tier(user.db, user.id)
    entitlement_service.require_model_access(tier, payload.modelId, user.id)
    await entitlement_service.check_rate_limit(user.db, user.id, tier)

    project_id = None
    if payload.projectId:
        # Jangan percaya projectId client mentah-mentah -- pastikan project itu
        # benar milik user ini (section 10 master prompt).
        found = await user.db.select("projects", {"select": "id", "id": f"eq.{payload.projectId}"})
        if not found:
            raise AppError("VALIDATION_ERROR", "Project Tidak Ditemukan.", status_code=422)
        project_id = payload.projectId

    if payload.conversationId:
        convs = await user.db.select("conversations", {"select": "id", "id": f"eq.{payload.conversationId}"})
        if not convs:
            raise AppError("NOT_FOUND", "Percakapan Tidak Ditemukan.", status_code=404)
        # Section 20 fix: SEBELUMNYA select ini gak ada limit sama sekali --
        # conversation yang udah ribuan pesan bakal ke-fetch UTUH dan dikirim ke
        # model AI (bisa kena limit context window provider, atau nge-bengkakin
        # biaya token gak perlu). Ambil N TERAKHIR (order desc + limit, dari
        # Settings/.env -- section 26), balik lagi ke urutan kronologis lewat
        # .reverse() sebelum dikirim ke provider.
        history = await user.db.select(
            "messages",
            {
                "select": "role,content",
                "conversation_id": f"eq.{payload.conversationId}",
                "order": "created_at.desc",
                "limit": str(get_settings().chat_history_limit),
            },
        )
        history.reverse()
        return payload.conversationId, history

    # Belum ada conversationId -- ini chat baru, backend yang buat rownya
    # (frontend dapet ID-nya balik lewat event "start").
    title = (payload.message or "").strip()[:80] or "Percakapan"
    conv = await user.db.insert_one(
        "conversations",
        {"user_id": user.id, "title": title, "model_id": payload.modelId, "project_id": project_id},
    )
    return conv["id"], []


async def stream_response(
    user: CurrentUser, payload: ChatStreamRequest, conversation_id: str, history: list[dict]
) -> AsyncIterator[bytes]:
    try:
        yield _sse("start", conversationId=conversation_id)

        # Simpan pesan user SEBELUM manggil provider -- kalau provider gagal
        # total, histori percakapan di DB tetap konsisten dgn apa yang user kirim.
        await user.db.insert_one(
            "messages",
            {"conversation_id": conversation_id, "user_id": user.id, "role": "user", "content": payload.message},
        )
        # Section 22 fix: trigger touch_updated_at (migration 0001) SUDAH ada di
        # tabel conversations, tapi cuma nyala kalau baris conversations-nya
        # SENDIRI di-UPDATE -- insert pesan baru gak otomatis nyentuh itu. Tanpa
        # baris di bawah, updated_at conversation gak pernah berubah gara-gara
        # chat baru, jadi urutan sidebar (order=updated_at.desc di
        # list_conversations) gak pernah refleksiin percakapan yang baru aktif.
        try:
            await user.db.update(
                "conversations",
                {"id": f"eq.{conversation_id}"},
                {"updated_at": datetime.now(timezone.utc).isoformat()},
            )
        except Exception:
            logger.warning("Gagal touch updated_at conversation_id=%s (non-fatal)", conversation_id)

        chain: list[ModelStep] = resolve_chain(payload.modelId)
        attempts = [(step, key) for step in chain for key in _api_keys_for(step.provider)]

        if not attempts:
            yield _sse("error", message="Belum Ada API Key Provider Yang Dikonfigurasi Di Server.")
            return

        full_text = ""
        started = False
        usage_out: dict = {}

        for step, api_key in attempts:
            stream_fn = STREAM_FUNCTIONS[step.provider]
            try:
                # CATATAN JUJUR (section 10 master prompt, belum dikerjakan): payload.systemPrompt
                # dikirim APA ADANYA ke provider -- gak ada instruksi internal/baseline
                # VaeltrixAI yang backend suntikkan sendiri di sini. Efeknya: siapa pun yang
                # manggil endpoint ini langsung (bukan lewat UI resmi) bebas nentuin system
                # prompt SEPENUHNYA sendiri, gak ada apa pun dari platform yang "bertahan" apa
                # pun isi field ini. Kalau VaeltrixAI mau ada baseline behavior/safety instruction
                # yang gak boleh ditimpa user, itu keputusan produk yang perlu ditentukan dulu
                # ISINYA (bukan sesuatu yang aman ditebak/ditulis sendiri di sini) -- pola yang
                # benar nanti kira-kira: system_prompt=f"{INTERNAL_BASELINE}\\n\\n{payload.systemPrompt}".
                # Batas panjang systemPrompt SUDAH ditambah (schemas/chat.py, section 19) --
                # itu bagian yang murni validasi, aman dikerjakan tanpa nebak keputusan produk.
                async for delta in stream_fn(
                    api_key=api_key,
                    model=step.model,
                    system_prompt=payload.systemPrompt,
                    history=history,
                    message=payload.message,
                    max_tokens=step.max_tokens,
                    usage_out=usage_out,
                ):
                    started = True
                    full_text += delta
                    yield _sse("chunk", text=delta)
                break  # generator kelar tanpa exception = sukses, gak perlu attempt lain
            except ProviderError as e:
                # Detail asli (bisa berisi potongan respons HTTP provider) CUMA ke log
                # server (section 25: jangan bocorin detail internal ke user) -- e.message
                # SENGAJA gak pernah ikut dikirim balik lewat SSE di bawah.
                logger.warning(
                    "Provider gagal: provider=%s model=%s retryable=%s already_started=%s detail=%s",
                    step.provider, step.model, e.retryable, started, e.message,
                )
                if started:
                    # Udah kepalang ngirim sebagian teks ke user -- gak mungkin lagi "batal"
                    # & ganti provider di tengah jalan. Berhenti apa adanya.
                    break
                continue  # belum ngirim apa-apa, aman coba attempt berikutnya di chain

        if not full_text:
            # Titik ini cuma ke-reach kalau attempts udah gak kosong (kasus "belum ada
            # API key" udah return duluan di atas) -- apa pun sebabnya di sini (exception
            # ATAU provider "sukses" tapi kosong), pesan ke user generik & aman.
            yield _sse("error", message="Semua Model Sedang Bermasalah, Coba Lagi Sebentar.")
            return

        message_id = None
        try:
            saved = await user.db.insert_one(
                "messages",
                {
                    "conversation_id": conversation_id,
                    "user_id": user.id,
                    "role": "assistant",
                    "content": full_text,
                    "model": payload.modelId,
                    "tokens": usage_out.get("total_tokens"),
                },
            )
            message_id = saved.get("id")
        except Exception:
            # Jawaban SUDAH lengkap ke-stream ke user -- kegagalan nyimpen ke DB di titik ini
            # gak boleh bikin percakapan yang sebenarnya sukses keliatan gagal di UI.
            pass

        yield _sse("done", messageId=message_id)
    except Exception:
        # Jaring pengaman terakhir: bug tak terduga di mana pun di atas TIDAK BOLEH bikin
        # koneksi putus mendadak tanpa event -- frontend butuh SATU event penutup yang jelas.
        yield _sse("error", message="Terjadi Kesalahan Tak Terduga Di Server.")
