from pydantic import BaseModel, Field


class CheckoutRequest(BaseModel):
    tier: str = Field(min_length=1)
    returnUrl: str = Field(min_length=1)
