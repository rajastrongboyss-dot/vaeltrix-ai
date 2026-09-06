from pydantic import BaseModel, Field


class RedeemCodeRequest(BaseModel):
    code: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(min_length=1)
    newPassword: str = Field(min_length=8)


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
