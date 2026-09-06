from fastapi import APIRouter

from app.api.v1 import account, auth, billing, chat, conversations, health, projects, settings, usage

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(account.router)
api_router.include_router(billing.router)
api_router.include_router(chat.router)
api_router.include_router(conversations.router)
api_router.include_router(projects.router)
api_router.include_router(settings.router)
api_router.include_router(usage.router)
