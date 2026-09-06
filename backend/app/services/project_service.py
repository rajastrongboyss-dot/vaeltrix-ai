"""Business logic projects -- pola sama seperti conversation_service.py."""
from app.core.dependencies import CurrentUser
from app.core.errors import AppError
from app.schemas.project import ProjectCreateRequest


async def list_projects(user: CurrentUser, limit: int) -> list[dict]:
    return await user.db.select(
        "projects",
        {"select": "id,name,createdAt:created_at", "order": "created_at.desc", "limit": str(limit)},
    )


async def get_project(user: CurrentUser, project_id: str) -> dict:
    rows = await user.db.select(
        "projects",
        {"select": "id,name,instructions,createdAt:created_at,updatedAt:updated_at", "id": f"eq.{project_id}"},
    )
    if not rows:
        raise AppError("NOT_FOUND", "Project Tidak Ditemukan.", status_code=404)
    return rows[0]


async def create_project(user: CurrentUser, payload: ProjectCreateRequest) -> dict:
    name = (payload.name or "").strip()
    if not name:
        raise AppError("VALIDATION_ERROR", "Nama Project Gak Boleh Kosong.", status_code=422)

    row = await user.db.insert_one(
        "projects",
        {"user_id": user.id, "name": name, "instructions": payload.instructions or ""},
    )
    return {"id": row["id"]}


async def update_project_instructions(user: CurrentUser, project_id: str, instructions: str) -> dict:
    rows = await user.db.update("projects", {"id": f"eq.{project_id}"}, {"instructions": instructions})
    if not rows:
        raise AppError("NOT_FOUND", "Project Tidak Ditemukan.", status_code=404)
    return {"id": rows[0]["id"], "instructions": rows[0]["instructions"]}


async def delete_project(user: CurrentUser, project_id: str) -> None:
    deleted = await user.db.delete("projects", {"id": f"eq.{project_id}"})
    if not deleted:
        raise AppError("NOT_FOUND", "Project Tidak Ditemukan.", status_code=404)
