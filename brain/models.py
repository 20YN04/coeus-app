from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class KennisItem(BaseModel):
    id: str
    title: str
    category: str
    content: str
    source: str = "manual"
    source_detail: Optional[str] = None
    created_at: datetime
    metadata: dict = {}

class CreateKennisRequest(BaseModel):
    # Inkomend model voor POST /kennis — clients mogen geen id of created_at meegeven
    title: str
    category: str
    content: str
    source: str = "manual"
    source_detail: Optional[str] = None

class UpdateKennisRequest(BaseModel):
    # Inkomend model voor PUT /kennis/{id} — alleen bewerkbare velden, allemaal optioneel
    title: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None

class LearnRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    category: Optional[str] = None

class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
