from pydantic import BaseModel


class SettingsUpdateRequest(BaseModel):
    settings: dict
