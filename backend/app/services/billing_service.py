"""
Billing (Stripe) -- section 17/24. Kontrak endpoint PERSIS yang sudah
diasumsikan frontend (17-account.js): POST /billing/checkout {tier,returnUrl}
-> {url}, GET /billing/portal -> {url}, GET /billing/subscription -> {tier}.

CATATAN JUJUR: exception SDK stripe-python di-catch pakai `Exception` generik
di sini (BUKAN kelas spesifik semacam `stripe.error.StripeError`) -- SDK ini
pernah restrukturisasi namespace exception-nya antar versi major, dan tanpa
akses internet live saya gak bisa pastiin path yang benar untuk versi yang
bakal ke-install (lihat requirements.txt). Nebak kelas exception yang salah
risikonya lebih parah (AttributeError pas nyoba nangkep) daripada catch
generik di titik yang memang sudah dipagari try/except.

Stripe Python SDK sifatnya SYNCHRONOUS (blocking) -- dibungkus
run_in_threadpool supaya gak nge-block event loop FastAPI yang async.

Webhook (section 19/24) TIDAK ada di kontrak frontend manapun -- Stripe yang
manggil endpoint ini langsung, bukan browser. WAJIB diverifikasi pakai
STRIPE_WEBHOOK_SECRET dulu; kalau gagal verifikasi, endpoint SENGAJA gak
memproses apa pun (section 25: jangan percaya request yang gak terverifikasi).
Kegagalan MEMPROSES event (bukan kegagalan verifikasi) sengaja DIBIARKAN jadi
500 -- itu sinyal standar Stripe buat retry otomatis nanti, bukan error yang
harus ditelan diam-diam.
"""
import stripe
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.core.dependencies import CurrentUser
from app.core.errors import AppError
from app.core.logging import get_logger
from app.integrations.supabase_client import PrivilegedRestClient, SupabaseRestError
from app.services import entitlement_service

logger = get_logger("app.billing")

TIER_TO_PRICE_ATTR = {"premium": "stripe_price_id_premium", "pro": "stripe_price_id_pro"}


def _price_id_for_tier(tier: str) -> str | None:
    attr = TIER_TO_PRICE_ATTR.get(tier)
    return getattr(get_settings(), attr) if attr else None


def _tier_for_price_id(price_id: str | None) -> str | None:
    if not price_id:
        return None
    settings = get_settings()
    if price_id == settings.stripe_price_id_premium:
        return "premium"
    if price_id == settings.stripe_price_id_pro:
        return "pro"
    return None


async def get_subscription(user: CurrentUser) -> dict:
    tier = await entitlement_service.get_tier(user.db, user.id)
    return {"tier": tier}


async def create_checkout_session(user: CurrentUser, tier: str, return_url: str, own_origin: str) -> dict:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise AppError("VALIDATION_ERROR", "Billing Belum Dikonfigurasi Di Server.", status_code=400)

    # Section 25: returnUrl datang dari body request client -- kalau gak
    # divalidasi, endpoint ini bisa disalahgunakan jadi open-redirect (checkout
    # sukses, lalu browser diarahkan ke domain sembarang milik penyerang).
    if not return_url.startswith(own_origin.rstrip("/")):
        raise AppError("VALIDATION_ERROR", "returnUrl Harus Mengarah Ke Aplikasi Ini Sendiri.", status_code=422)

    price_id = _price_id_for_tier(tier)
    if not price_id:
        raise AppError("VALIDATION_ERROR", f"Paket '{tier}' Gak Dikenal.", status_code=422)

    stripe.api_key = settings.stripe_secret_key

    rows = await user.db.select("profiles", {"select": "stripe_customer_id", "id": f"eq.{user.id}"})
    existing_customer_id = rows[0].get("stripe_customer_id") if rows else None

    def _create_session():
        customer_id = existing_customer_id
        if not customer_id:
            customer = stripe.Customer.create(email=user.email, metadata={"vaeltrix_user_id": user.id})
            customer_id = customer.id
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=return_url,
            cancel_url=return_url,
            client_reference_id=user.id,
            metadata={"vaeltrix_user_id": user.id},
        )
        return customer_id, session

    try:
        customer_id, session = await run_in_threadpool(_create_session)
    except Exception as e:
        logger.warning("Stripe checkout gagal: user_id=%s error=%s", user.id, str(e))
        raise AppError("PROVIDER_ERROR", "Gagal Membuka Halaman Pembayaran.", status_code=502) from e

    if not existing_customer_id:
        # Kolom stripe_customer_id sengaja gak di-grant ke role authenticated
        # (migration 0006) -- nulisnya WAJIB lewat privileged client, discope
        # manual ke user.id yang sudah diverifikasi (section 10).
        privileged = PrivilegedRestClient()
        await privileged.update("profiles", {"id": f"eq.{user.id}"}, {"stripe_customer_id": customer_id})

    return {"url": session.url}


async def create_portal_session(user: CurrentUser, return_url: str) -> dict:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise AppError("VALIDATION_ERROR", "Billing Belum Dikonfigurasi Di Server.", status_code=400)

    rows = await user.db.select("profiles", {"select": "stripe_customer_id", "id": f"eq.{user.id}"})
    customer_id = rows[0].get("stripe_customer_id") if rows else None
    if not customer_id:
        raise AppError("VALIDATION_ERROR", "Belum Ada Langganan Aktif.", status_code=400)

    stripe.api_key = settings.stripe_secret_key

    def _create_portal():
        return stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)

    try:
        portal = await run_in_threadpool(_create_portal)
    except Exception as e:
        logger.warning("Stripe portal gagal: user_id=%s error=%s", user.id, str(e))
        raise AppError("PROVIDER_ERROR", "Gagal Membuka Portal Billing.", status_code=502) from e

    return {"url": portal.url}


async def handle_webhook(payload: bytes, sig_header: str | None) -> None:
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise AppError("VALIDATION_ERROR", "Webhook Belum Dikonfigurasi.", status_code=400)

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except Exception as e:
        # Signature gak valid (atau payload rusak) -- SATU-SATUNYA bukti request
        # ini beneran dari Stripe, jadi tolak mentah-mentah, jangan proses apa pun.
        logger.warning("Stripe webhook ditolak (signature/payload invalid): %s", str(e))
        raise AppError("AUTHENTICATION_ERROR", "Signature Tidak Valid.", status_code=400) from e

    event_type = event["type"]
    obj = event["data"]["object"]
    privileged = PrivilegedRestClient()

    # Section 25 fix: SEBELUMNYA tidak ada apa pun yang nyatet event mana yang
    # udah diproses -- retry Stripe (timeout endpoint kita, atau replay manual)
    # bisa bikin event yang SAMA diproses dua kali. event_id Stripe itu primary
    # key di migration 0007 -- insert kedua ke ID yang sama otomatis gagal (409
    # unique violation), kita tangkep itu SPESIFIK sebagai "udah pernah diproses"
    # dan berhenti di sini, BUKAN ditelan sebagai error generik biasa.
    try:
        await privileged.insert_one(
            "processed_stripe_events", {"event_id": event["id"], "event_type": event_type}
        )
    except SupabaseRestError as e:
        if e.status_code == 409:
            logger.info("Stripe webhook duplikat, diabaikan: event_id=%s type=%s", event["id"], event_type)
            return
        raise

    if event_type == "checkout.session.completed":
        customer_id = obj.get("customer")

        def _get_line_items():
            return stripe.checkout.Session.list_line_items(obj["id"], limit=1)

        line_items = await run_in_threadpool(_get_line_items)
        price_id = line_items.data[0].price.id if line_items.data else None
        tier = _tier_for_price_id(price_id)
        if customer_id and tier:
            await privileged.update("profiles", {"stripe_customer_id": f"eq.{customer_id}"}, {"tier": tier})
            logger.info("Tier diupgrade via Stripe checkout: customer=%s tier=%s", customer_id, tier)
        else:
            logger.warning(
                "checkout.session.completed tapi tier gak kekenali: customer=%s price_id=%s",
                customer_id, price_id,
            )

    elif event_type == "customer.subscription.deleted":
        customer_id = obj.get("customer")
        if customer_id:
            await privileged.update("profiles", {"stripe_customer_id": f"eq.{customer_id}"}, {"tier": "free"})
            logger.info("Tier diturunkan ke free (subscription deleted): customer=%s", customer_id)

    elif event_type == "customer.subscription.updated":
        customer_id = obj.get("customer")
        status = obj.get("status")
        if customer_id and status in ("canceled", "unpaid", "incomplete_expired"):
            await privileged.update("profiles", {"stripe_customer_id": f"eq.{customer_id}"}, {"tier": "free"})
            logger.info("Tier diturunkan ke free (status=%s): customer=%s", status, customer_id)
    # Event type lain SENGAJA diabaikan diam-diam -- Stripe ngirim banyak event
    # yang gak relevan buat tier gating kita (invoice.*, payment_intent.*, dst).
