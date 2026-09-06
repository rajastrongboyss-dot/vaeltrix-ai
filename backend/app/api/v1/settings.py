"""GET/PATCH /api/v1/settings -- lihat services/settings_service.py."""
from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, get_current_user
from app.core.responses import ok
from app.schemas.settings import SettingsUpdateRequest
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings_endpoint(user: CurrentUser = Depends(get_current_user)):
    data = await settings_service.get_user_settings(user)
    return ok({"settings": data})


@router.patch("")
async def update_settings_endpoint(
    payload: SettingsUpdateRequest, user: CurrentUser = Depends(get_current_user)
):
    data = await settings_service.update_settings(user, payload.settings)
    return ok({"settings": data})
