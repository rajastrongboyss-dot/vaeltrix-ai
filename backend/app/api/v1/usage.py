"""GET /api/v1/usage -- lihat services/usage_service.py."""
from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, get_current_user
from app.core.responses import ok
from app.services import usage_service

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("")
async def get_usage(user: CurrentUser = Depends(get_current_user)):
    data = await usage_service.get_usage(user)
    return ok(data)
