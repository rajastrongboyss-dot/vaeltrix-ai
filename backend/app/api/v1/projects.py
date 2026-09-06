"""
Kontrak PERSIS yang sudah diasumsikan frontend di 14-projects.js / 18-cloud-sync.js:
- GET    /projects?limit=50      -> {items:[{id,name,createdAt}]}
- POST   /projects               -> {project:{id}}
- GET    /projects/{id}          -> {project:{instructions, ...}}
- PATCH  /projects/{id}          -> {project:{...}}
- DELETE /projects/{id}
"""
from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, get_current_user
from app.core.responses import ok
from app.schemas.project import ProjectCreateRequest, ProjectUpdateRequest
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
async def list_projects(
    user: CurrentUser = Depends(get_current_user),
    limit: int = Query(default=50, le=100),
):
    items = await project_service.list_projects(user, limit)
    return ok({"items": items})


@router.post("", status_code=201)
async def create_project(payload: ProjectCreateRequest, user: CurrentUser = Depends(get_current_user)):
    project = await project_service.create_project(user, payload)
    return ok({"project": project})


@router.get("/{project_id}")
async def get_project(project_id: str, user: CurrentUser = Depends(get_current_user)):
    project = await project_service.get_project(user, project_id)
    return ok({"project": project})


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    project = await project_service.update_project_instructions(user, project_id, payload.instructions)
    return ok({"project": project})


@router.delete("/{project_id}")
async def delete_project(project_id: str, user: CurrentUser = Depends(get_current_user)):
    await project_service.delete_project(user, project_id)
    return ok(None)
