"""Endpoint akun -- redeem-code (section 17 fix), change-password, delete
account (section 24). Lihat services/account_service.py untuk detail kenapa
masing-masing butuh privileged client atau tidak."""
from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, get_current_user
from app.core.responses import ok
from app.schemas.account import ChangePasswordRequest, RedeemCodeRequest, UpdateProfileRequest
from app.services import account_service

router = APIRouter(prefix="/account", tags=["account"])


@router.post("/redeem-code")
async def redeem_code(payload: RedeemCodeRequest, user: CurrentUser = Depends(get_current_user)):
    tier = await account_service.redeem_code(user, payload.code)
    return ok({"tier": tier})


@router.patch("/profile")
async def update_profile(payload: UpdateProfileRequest, user: CurrentUser = Depends(get_current_user)):
    data = await account_service.update_profile(user, payload.name)
    return ok(data)


@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, user: CurrentUser = Depends(get_current_user)):
    await account_service.change_password(user, payload.currentPassword, payload.newPassword)
    return ok(None)


@router.delete("")
async def delete_account(user: CurrentUser = Depends(get_current_user)):
    await account_service.delete_account(user)
    return ok(None)
