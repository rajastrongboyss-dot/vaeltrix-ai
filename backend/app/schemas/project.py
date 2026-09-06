from pydantic import BaseModel, Field

from app.config import get_settings

_settings = get_settings()  # Section 26 fix -- lihat komentar sama di schemas/chat.py


class ProjectCreateRequest(BaseModel):
    name: str = Field(max_length=_settings.max_project_name_length)
    instructions: str | None = Field(default=None, max_length=_settings.max_project_instructions_length)


class ProjectUpdateRequest(BaseModel):
    instructions: str = Field(max_length=_settings.max_project_instructions_length)
