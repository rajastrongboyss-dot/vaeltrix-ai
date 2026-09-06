"""
GET /billing/subscription, POST /billing/checkout, GET /billing/portal --
kontrak PERSIS yang diasumsikan 17-account.js. POST /billing/webhook TIDAK
ada di kontrak frontend (Stripe yang manggil langsung) -- lihat
services/billing_service.py.
"""
from fastapi import APIRouter, Depends, Header, Request

from app.core.dependencies import CurrentUser, get_current_user
from app.core.responses import ok
from app.schemas.billing import CheckoutRequest
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/subscription")
async def get_subscription(user: CurrentUser = Depends(get_current_user)):
    data = await billing_service.get_subscription(user)
    return ok(data)


@router.post("/checkout")
async def create_checkout(payload: CheckoutRequest, request: Request, user: CurrentUser = Depends(get_current_user)):
    data = await billing_service.create_checkout_session(user, payload.tier, payload.returnUrl, str(request.base_url))
    return ok(data)


@router.get("/portal")
async def get_portal(request: Request, user: CurrentUser = Depends(get_current_user)):
    # frontend (openVaeltrixBillingPortal) manggil ini TANPA body -- return_url
    # dibutuhkan Stripe, jadi dibalikin ke origin app ini sendiri.
    return_url = str(request.base_url)
    data = await billing_service.create_portal_session(user, return_url)
    return ok(data)


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None)):
    # WAJIB raw body (bukan payload.dict() dari Pydantic) -- verifikasi
    # signature Stripe dihitung dari byte mentahnya persis.
    raw_body = await request.body()
    await billing_service.handle_webhook(raw_body, stripe_signature)
    return ok(None)
